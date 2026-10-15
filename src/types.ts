import type { ShoppingRoom, Player, Argument, Turn, RoomEvent, Judgement, JudgeResult, Side } from './shopping/types.ts';
export interface JudgeInput {topic:string;arguments:{side:Side;text:string}[];candidates?:{side:Side;name:string;spec:string;unit_price_cents:number;source:'TEST_FIXTURE'|'AGENT_REPORTED'}[]}
export interface LegacyJob {job_id:string;claimed:boolean;deadline_at:number;parties:{side:Side;player_id:string}[];input:JudgeInput}
export interface LegacyRoom {
  mode?:undefined;room_id:string;host_player_id:string;topic:string;expected_players:number;max_turns:number;
  status:'WAITING'|'READY'|'ACTIVE'|'FINISHED'|'PAUSED'|'CLOSED'|'EXPIRED';players:Player[];arguments:Argument[];events:RoomEvent[];sequence:number;turn_index:number;current_turn:Turn|null;created_at:number;expires_at:number;
  _turn_ms?:number;judgement?:Judgement;_judge_job?:LegacyJob;_watch_token?:string;_watch_token_hash?:string;
}
export type StoredRoom=LegacyRoom|ShoppingRoom;
export type JudgeEnv=import('./model-config.ts').ModelEnv;
export type JudgeOutcome={result:JudgeResult;error_code?:never}|{error_code:string;result?:never};
export type RoomView=ReturnType<typeof import('./core.ts').viewRoom>|ReturnType<typeof import('./shopping/room.ts').viewShopping>;
export interface ApiError {code:string;message:string;expected_action:string;retryable:boolean}
export type ApiBody={ok:true;data:{room:RoomView;player_id?:string;player_token?:string;watch_url?:string;replayed?:boolean;[key:string]:unknown}}|{ok:false;error:ApiError};
