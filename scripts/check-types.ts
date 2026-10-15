import type { viewRoom } from '../src/core.ts';
import type { ApiError } from '../src/types.ts';
export interface LegacyData {room:ReturnType<typeof viewRoom>;player_id:string;player_token:string;watch_url:string;replayed?:boolean;next_action:string;next_request:{arguments:Record<string,unknown>}}
export interface CheckBody {ok:boolean;data:LegacyData;error:ApiError}
export interface CheckResponse extends CheckBody {status:number}
