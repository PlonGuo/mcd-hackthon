import { z } from 'zod';
import { id, eventId, version, text } from './schemas.ts';

const base={checkout_id:id,event_id:eventId};
const cents=z.int().min(0).max(999_999_000);
export const checkoutSchemas={
  nominate:z.strictObject({candidate_player_id:id,event_id:eventId}),
  accept:z.strictObject({candidate_version:version,event_id:eventId}),
  prepare:z.strictObject({expected_draft_version:version,event_id:eventId}),
  package:z.strictObject(base),
  cancel:z.strictObject(base),
  report:z.strictObject({...base,expected_checkout_version:version,outcome:z.enum(['QUOTED','SUBMITTING','UNKNOWN','NO_ORDER','ORDER_CREATED','PAID','ORDER_CANCELLED']),total_cents:cents.optional(),quote_id:id.optional(),expected_total_cents:cents.optional(),take_way_options:z.array(z.strictObject({code:id,title:text(40)})).min(1).max(10).optional(),take_way_code:id.optional()}),
  simulate:z.strictObject({...base,operation:z.enum(['quote','create','query','pay','abandon']),scenario:z.enum(['success','rejected','timeout_created','timeout_no_order']).optional()}),
};
