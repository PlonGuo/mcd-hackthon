import { z } from 'zod';
import { RoomError } from '../core.ts';
export const text = (max: number) => z.string().trim().min(1).refine(v => [...v].length <= max).meta({maxLength:max});
export const id = z.string().min(1).max(100);
export const eventId = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
export const version = z.int().min(0).max(999999);
export const quantity = z.int().min(1).max(20);
export const schemas = {
  create: z.strictObject({mode:z.literal('shopping'),name:text(40),topic:text(200),agent_label:text(40).optional(),expected_players:z.literal(2).optional(),max_turns:z.literal(4).optional()}),
  join: z.strictObject({name:text(40),agent_label:text(40).optional()}),
  context: z.strictObject({store_code:text(100),name:text(100),address:text(200),fulfillment:z.literal('SELF_PICKUP'),expected_context_version:z.literal(0)}),
  item: z.strictObject({meal_code:text(100),name:text(100),spec:text(100),unit_price_cents:z.int().min(0).max(999999),queried_at:z.int().min(0)}),
  draft: z.strictObject({operation:z.enum(['add','set_quantity','remove']),item_id:id.describe('仅add填写：使用room.items中的item_id，不能用meal_code').optional(),line_id:id.describe('仅set_quantity/remove填写；add必须省略line_id').optional(),owner:z.enum(['self','shared']).describe('仅add必填：self是本人个人项目，shared是共同项目（房主操作）').optional(),quantity:quantity.describe('add/set_quantity必填；remove必须省略').optional(),expected_draft_version:version,event_id:eventId}),
  battle: z.strictObject({topic:text(200),event_id:eventId}),
  ready: z.strictObject({battle_id:id,ready:z.boolean(),candidate_item_id:id.optional()}),
  start: z.strictObject({battle_id:id}),
  say: z.strictObject({battle_id:id,turn_id:id,event_id:eventId,text:text(200)}),
  cancel: z.strictObject({battle_id:id}),
  recommendation: z.strictObject({battle_id:id,recommendation_id:id,decision:z.enum(['apply','dismiss']),quantity:quantity.optional(),expected_draft_version:version,event_id:eventId}),
  state: z.strictObject({}),close:z.strictObject({}),
};
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const out=schema.safeParse(input);
  if(!out.success) throw new RoomError('INVALID_ARGUMENT','参数不符合工具定义，请检查字段和范围');
  return out.data;
}
