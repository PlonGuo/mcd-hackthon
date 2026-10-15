import test from 'node:test';
import assert from 'node:assert/strict';
import { searchInput, pickupInput, priceInput, callOfficialReadOnly, normalizeStores, normalizeItem, normalizeQuote, yuanToCents } from '../scripts/lib/mcd-readonly.ts';

const packet={source:'AGENT_REPORTED',context:{store_code:'STORE123',fulfillment:'SELF_PICKUP',source:'AGENT_REPORTED'},draft:{lines:[
  {item:{meal_code:'CHICKEN',store_code:'STORE123',source:'AGENT_REPORTED'},quantity:2},
  {item:{meal_code:'CHICKEN',store_code:'STORE123',source:'AGENT_REPORTED'},quantity:1},
  {item:{meal_code:'FRIES',store_code:'STORE123',source:'AGENT_REPORTED'},quantity:1},
]}};

test('官方门店搜索使用用户给的城市和地点，只允许到店自取且不查询收藏',()=>{
  assert.deepEqual(searchInput('上海市','人民广场'),{city:'上海市',keyword:'人民广场',searchType:2,beType:1});
  assert.throws(()=>searchInput('', '人民广场'));
  assert.deepEqual(pickupInput(' STORE123 '),{storeCode:'STORE123',orderType:1,beType:1});
});

test('固定清单映射官方productCode/quantity，合并重复餐品，不传beCode或虚构takeWayCode',()=>{
  assert.deepEqual(priceInput(packet),{storeCode:'STORE123',orderType:1,beType:1,items:[{productCode:'CHICKEN',quantity:3},{productCode:'FRIES',quantity:1}]});
  assert.deepEqual(priceInput(packet,{needTableware:false}).needTableware,false);
  assert.throws(()=>priceInput(packet,{storeCode:'OTHER',items:[{productCode:'OTHER_MEAL',quantity:2}]}));
  const fake=structuredClone(packet);fake.source='TEST_FIXTURE';assert.throws(()=>priceInput(fake));
  const other=structuredClone(packet);other.draft.lines[0].item.store_code='OTHER';assert.throws(()=>priceInput(other));
  const empty=structuredClone(packet);empty.draft.lines=[];assert.throws(()=>priceInput(empty));
  const quantity=structuredClone(packet);quantity.draft.lines[0].quantity=1.5;assert.throws(()=>priceInput(quantity));
});

test('官方只读客户端拒绝写操作、额外字段和错误到店参数，拒绝时不调用上游',async()=>{
  const calls=[];const client={callTool:async request=>{calls.push(request);return {content:[{type:'text',text:'{"code":"0","data":{}}'}]};}};
  for(const [name,input] of [
    ['create-order',{storeCode:'STORE123',orderType:1,beType:1}],
    ['cancel-order',{orderId:'private'}],
    ['order-list',{}],
    ['query-meals',{storeCode:'STORE123',orderType:1,beType:1,beCode:'BAD'}],
    ['query-nearby-stores',{city:'上海',keyword:'人民广场',beType:1,searchType:1}],
    ['calculate-price',{storeCode:'STORE123',orderType:1,beType:1,items:[]}],
  ])await assert.rejects(()=>callOfficialReadOnly(client,name,input));
  assert.equal(calls.length,0);
  const data=await callOfficialReadOnly(client,'query-meals',pickupInput('STORE123'));
  assert.deepEqual(data,{code:'0',data:{}});assert.equal(calls.length,1);
});

test('官方失败脱敏，SDK文本JSON与结构化响应均可读，不自动重试业务调用',async()=>{
  let calls=0;
  await assert.rejects(()=>callOfficialReadOnly({callTool:async()=>{calls++;throw new Error('SECRET_TOKEN 原始上游响应');}},'query-meals',pickupInput('STORE123')),e=>!e.message.includes('SECRET_TOKEN'));
  assert.equal(calls,1);
  await assert.rejects(()=>callOfficialReadOnly({callTool:async()=>({isError:true,content:[{type:'text',text:'SECRET_TOKEN'}]})},'query-meals',pickupInput('STORE123')),e=>!e.message.includes('SECRET_TOKEN'));
  const result=await callOfficialReadOnly({callTool:async()=>({structuredContent:{code:0,data:[]},content:[]})},'query-meals',pickupInput('STORE123'));
  assert.deepEqual(result,{code:0,data:[]});
  await assert.rejects(()=>callOfficialReadOnly({callTool:async()=>({content:[{type:'text',text:'not JSON'}]})},'query-meals',pickupInput('STORE123')));
  await assert.rejects(()=>callOfficialReadOnly({callTool:async()=>({content:[{type:'text',text:'{"success":false,"code":401,"message":"SECRET_TOKEN"}'}]})},'query-meals',pickupInput('STORE123')),e=>!e.message.includes('SECRET_TOKEN'));
});

test('官方菜单元字符串转整数分，核价分保持原值；拒绝猜测浮点与科学计数',()=>{
  assert.equal(yuanToCents('14'),1400);assert.equal(yuanToCents('13.5'),1350);assert.equal(yuanToCents('0.01'),1);
  for(const value of ['1.005','-1','1e2','¥14',13.5,'10000'])assert.throws(()=>yuanToCents(value));
  const menu={success:true,code:200,data:{meals:{'1401':{name:'麦乐鸡',currentPrice:'14'}}}};
  const detail={success:true,code:200,data:{code:'1401',name:'麦乐鸡5块',rounds:[],supportModify:false}};
  assert.deepEqual(normalizeItem(menu,detail,'1401',1000),{meal_code:'1401',name:'麦乐鸡5块',spec:'默认规格',unit_price_cents:1400,queried_at:1000});
  assert.throws(()=>normalizeItem(menu,{...detail,data:{...detail.data,rounds:[{choices:[]}]}},'1401',1000));
  assert.throws(()=>normalizeItem(menu,{...detail,data:{...detail.data,supportModify:true}},'1401',1000));
});

test('官方数据归一化只留公开白名单，失败不冒充成功；核价须与提交商品和数量吻合',()=>{
  const store={storeCode:'STORE123',storeName:'门店',address:'公开地址',businessStatus:true,distance:85,phone:'PRIVATE',latitude:31};
  assert.deepEqual(normalizeStores({success:true,code:200,data:[store]}),[{store_code:'STORE123',name:'门店',address:'公开地址',fulfillment:'SELF_PICKUP',business_status:true,distance:85}]);
  assert.throws(()=>normalizeStores({success:false,code:500,data:[]}));
  const request={storeCode:'STORE123',orderType:1,beType:1,items:[{productCode:'1401',quantity:1},{productCode:'4810',quantity:1}]};
  const reply={success:true,code:200,data:{price:2750,originalPrice:2750,discount:0,productList:[{productCode:'1401',productName:'麦乐鸡5块',quantity:1,subtotal:1400},{productCode:'4810',productName:'中薯条',quantity:1,subtotal:1350}],takeWayList:[{code:'eat-in',title:'堂食'},{code:'take-in-store',title:'外带'}],phone:'PRIVATE'}};
  const quote=normalizeQuote(reply,request);assert.equal(quote.total_cents,2750);assert.equal(quote.take_way_options[1].code,'take-in-store');assert.equal(JSON.stringify(quote).includes('PRIVATE'),false);
  const mismatch=structuredClone(reply);mismatch.data.productList[0].quantity=2;assert.throws(()=>normalizeQuote(mismatch,request));
  const cents=structuredClone(reply);cents.data.price=27.5;assert.throws(()=>normalizeQuote(cents,request));
  const duplicated=structuredClone(reply);duplicated.data.takeWayList[1].code='eat-in';assert.throws(()=>normalizeQuote(duplicated,request));
});
