export type Source = 'TEST_FIXTURE' | 'AGENT_REPORTED';
export type Side = 'A' | 'B';
export interface Identity { room_id?: string; player_id: string; token_hash: string }
export interface Player { player_id: string; token_hash: string; name: string; agent_label: string; last_seen_at: number; ready: boolean }
export interface Store { version: number; store_code: string; name: string; address: string; fulfillment: 'SELF_PICKUP'; source: Source }
export interface Item { item_id: string; version: number; reporter_player_id: string; store_code: string; meal_code: string; name: string; spec: string; unit_price_cents: number; queried_at: number; received_at: number; source: Source }
export interface Line { line_id: string; owner_player_id: string | null; item: Item; quantity: number }
export interface Draft { version: number; lines: Line[]; total_cents: number }
export interface Argument { sequence: number; event_sequence: number; turn_id: string; event_id: string; player_id: string; text: string; created_at: number }
export interface Turn { turn_id: string; player_id: string; deadline_at: number }
export interface JudgeResult {
  scores: {player_id: string; fit: number; evidence: number; response: number; humor: number; total: number; reason: string}[];
  winner_player_id: string; tie_break: {player_id: string; reason: string} | null;
  round_comments: {round: number; comment: string}[]; summary: string;
}
export type Judgement = {status: 'NOT_STARTED' | 'PENDING'} | {status:'FAILED'; error_code: string} | {status:'SUCCEEDED'; result: JudgeResult};
export interface JudgeJob { job_id: string; battle_id: string; claimed: boolean; deadline_at: number; parties: {side: Side; player_id: string}[]; input: {topic: string; arguments: {side: Side; text: string}[]; candidates: {side: Side; name: string; spec: string; unit_price_cents: number; source: Source}[]} }
export interface Recommendation { recommendation_id: string; item: Item; status: 'PENDING' | 'APPLIED' | 'DISMISSED' }
export interface Battle { battle_id: string; topic: string; status: 'PREPARING' | 'ACTIVE' | 'JUDGING' | 'FINISHED' | 'PAUSED' | 'FAILED' | 'CANCELLED'; ready: Record<string, Item | null>; candidates: Partial<Record<Side, Item>>; arguments: Argument[]; current_turn: Turn | null; judgement: Judgement; recommendation: Recommendation | null; _judge_job?: JudgeJob }
export interface RoomEvent { sequence: number; type: string; player_id: string | null; created_at: number }
export interface Payer { version: number; player_id: string; accepted: boolean }
export type CheckoutStatus = 'PREPARED' | 'HANDED_OFF' | 'QUOTED' | 'SUBMITTING' | 'UNKNOWN' | 'ORDER_CREATED' | 'PAID' | 'ORDER_CANCELLED' | 'NO_ORDER' | 'CANCELLED';
export interface TakeWay {code:string;title:string}
export interface CheckoutQuote { quote_id: string; total_cents: number; currency: 'CNY'; expires_at: number; source: Source; take_way_options: TakeWay[] }
export interface Checkout {
  checkout_id: string; version: number; payer_player_id: string; payer_version: number; draft_version: number;
  status: CheckoutStatus; source: Source; context: Store; draft: Draft; quote: CheckoutQuote | null;
  created_at: number; updated_at: number; submission_deadline_at: number | null; reconcile_until: number;
  _demo_order?: { status: 'ORDER_CREATED' | 'PAID' };
  take_way?: TakeWay | null;
}
export interface CheckoutPackage { checkout_id: string; draft_version: number; context: Store; draft: Draft; source: Source; quote: CheckoutQuote | null }
export interface ShoppingRoom {
  mode: 'shopping'; room_id: string; host_player_id: string; topic: string; status: 'OPEN' | 'CLOSED' | 'EXPIRED';
  players: Player[]; context: Store | null; items: Item[]; draft: Draft; battles: Battle[]; active_battle_id: string | null;
  sequence: number; events: RoomEvent[]; created_at: number; expires_at: number;
  _turn_ms: number; _judge_enabled: boolean; _data_source: Source; _receipts: Record<string, {actor: string; action: string; payload: string}>;
  _watch_token?: string; _watch_token_hash?: string;
  payer?: Payer | null; checkout?: Checkout | null; _checkout_history?: Checkout[];
}
export type Outcome = {result: JudgeResult} | {error_code: string};
