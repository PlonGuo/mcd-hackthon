import { z } from 'zod';
export const DEMO_STORE={store_code:'TEST_STORE',name:'演示门店（测试）',address:'测试路1号 · 非真实门店',fulfillment:'SELF_PICKUP' as const};
export const DEMO_ITEMS=[{meal_code:'TEST_NUGGETS',name:'麦乐鸡（测试）',spec:'5块装',unit_price_cents:1300},{meal_code:'TEST_FRIES',name:'薯条（测试）',spec:'中份',unit_price_cents:1200},{meal_code:'TEST_COLA',name:'可乐（测试）',spec:'中杯',unit_price_cents:900}];
export const catalogSchema=z.strictObject({});
export function demoCatalog() { return {source:'TEST_FIXTURE',notice:'固定开发数据，非官方查询或实际售价',stores:[DEMO_STORE],items:DEMO_ITEMS.map(i=>({...i,queried_at:Date.now()}))}; }
