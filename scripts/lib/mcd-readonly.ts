import { z } from 'zod';
import type { Client } from '@modelcontextprotocol/client';

const text=z.string().trim().min(1).max(200);
const cents=z.int().min(0).max(999_999_000);
function officialData(raw:unknown){return z.object({success:z.literal(true),code:z.literal(200),data:z.unknown()}).parse(raw).data;}
export function yuanToCents(raw:unknown):number{
  const value=z.string().regex(/^\d{1,4}(?:\.\d{1,2})?$/).parse(raw),[whole,fraction='']=value.split('.');
  return z.int().min(0).max(999999).parse(Number(whole)*100+Number(fraction.padEnd(2,'0')));
}
export function normalizeStores(raw:unknown){
  const stores=z.array(z.object({storeCode:text,storeName:text,address:text,businessStatus:z.boolean(),distance:z.number().nonnegative()})).max(100).parse(officialData(raw));
  return stores.map(s=>({store_code:s.storeCode,name:s.storeName,address:s.address,fulfillment:'SELF_PICKUP' as const,business_status:s.businessStatus,distance:s.distance}));
}
export function normalizeItem(menu:unknown,detail:unknown,code:string,queriedAt:number){
  const meals=z.object({meals:z.record(z.string(),z.object({currentPrice:z.string()}))}).parse(officialData(menu)).meals;
  const d=z.object({code:text,name:text,rounds:z.array(z.unknown()).max(0),supportModify:z.literal(false)}).parse(officialData(detail));
  if(d.code!==code||!Object.hasOwn(meals,code))throw new Error('MCD_PRODUCT_MISMATCH');
  return {meal_code:code,name:d.name,spec:'默认规格',unit_price_cents:yuanToCents(meals[code].currentPrice),queried_at:z.int().nonnegative().parse(queriedAt)};
}
export function normalizeQuote(reply:unknown,request:unknown){
  const input=schemas['calculate-price'].parse(request);
  const d=z.object({price:cents,originalPrice:cents,discount:cents,
    productList:z.array(z.object({productCode:text,productName:text,quantity:z.int().min(1).max(20),subtotal:cents})).min(1).max(50),
    takeWayList:z.array(z.object({code:text,title:text})).min(1).max(10),
  }).parse(officialData(reply));
  if(d.originalPrice-d.discount!==d.price)throw new Error('MCD_PRICE_INCONSISTENT');
  const expected=new Map(input.items.map(i=>[i.productCode,i.quantity]));
  if(expected.size!==input.items.length||d.productList.length!==expected.size)throw new Error('MCD_QUOTE_ITEMS_MISMATCH');
  for(const item of d.productList){if(expected.get(item.productCode)!==item.quantity)throw new Error('MCD_QUOTE_ITEMS_MISMATCH');expected.delete(item.productCode);}
  if(expected.size||new Set(d.takeWayList.map(t=>t.code)).size!==d.takeWayList.length)throw new Error('MCD_QUOTE_ITEMS_MISMATCH');
  return {total_cents:d.price,original_total_cents:d.originalPrice,discount_cents:d.discount,
    products:d.productList.map(p=>({meal_code:p.productCode,name:p.productName,quantity:p.quantity,subtotal_cents:p.subtotal})),take_way_options:d.takeWayList};
}
const pickup={storeCode:text,orderType:z.literal(1),beType:z.literal(1)};
const schemas={
  'query-nearby-stores':z.strictObject({city:text,keyword:text,searchType:z.literal(2),beType:z.literal(1)}),
  'query-meals':z.strictObject(pickup),
  'query-meal-detail':z.strictObject({...pickup,code:text}),
  'calculate-price':z.strictObject({...pickup,items:z.array(z.strictObject({productCode:text,quantity:z.int().min(1).max(20)})).min(1).max(50),needTableware:z.boolean().optional()}),
};
export function searchInput(city:unknown,keyword:unknown){return schemas['query-nearby-stores'].parse({city,keyword,searchType:2,beType:1});}
export function pickupInput(storeCode:unknown){return schemas['query-meals'].parse({storeCode,orderType:1,beType:1});}
const packetSchema=z.object({
  source:z.literal('AGENT_REPORTED'),
  context:z.object({store_code:text,fulfillment:z.literal('SELF_PICKUP'),source:z.literal('AGENT_REPORTED')}),
  draft:z.object({lines:z.array(z.object({item:z.object({meal_code:text,store_code:text,source:z.literal('AGENT_REPORTED')}),quantity:z.int().min(1).max(20)})).min(1).max(50)}),
});
export function priceInput(raw:unknown,options:{needTableware?:boolean}={}){
  const packet=packetSchema.parse(raw),settings=z.strictObject({needTableware:z.boolean().optional()}).parse(options),quantities=new Map<string,number>();
  for(const line of packet.draft.lines){
    if(line.item.store_code!==packet.context.store_code)throw new Error('MCD_STORE_MISMATCH');
    quantities.set(line.item.meal_code,(quantities.get(line.item.meal_code)??0)+line.quantity);
  }
  return schemas['calculate-price'].parse({...pickupInput(packet.context.store_code),items:[...quantities].map(([productCode,quantity])=>({productCode,quantity})),...settings});
}
export async function callOfficialReadOnly(client:Pick<Client,'callTool'>,name:string,input:unknown):Promise<Record<string,unknown>>{
  if(!Object.hasOwn(schemas,name))throw new Error('MCD_READ_ONLY_TOOL_REQUIRED');
  const args=schemas[name as keyof typeof schemas].parse(input);
  let result:Awaited<ReturnType<Client['callTool']>>;
  try{result=await client.callTool({name,arguments:args},{timeout:15000});}
  catch{throw new Error('MCD_READ_ONLY_REQUEST_FAILED');}
  if(result.isError)throw new Error('MCD_READ_ONLY_TOOL_ERROR');
  try{
    const textBlocks=result.content.filter(c=>c.type==='text');
    const raw=result.structuredContent??(textBlocks.length===1?JSON.parse(textBlocks[0].text):undefined);
    if(JSON.stringify(raw).length>1_048_576)throw new Error('oversized');
    const body=z.record(z.string(),z.unknown()).parse(raw);
    if(body.success===false||(body.code!==undefined&&![0,200,'0','200'].includes(body.code as string|number)))throw new Error('business error');
    return body;
  }catch{throw new Error('MCD_READ_ONLY_INVALID_REPLY');}
}
