import type { LegacyRoom, JudgeOutcome } from './types.ts';
export const JUDGE_MS=60000;
function event(room: LegacyRoom,type: string,now: number){room.sequence++;room.events.push({sequence:room.sequence,type,player_id:null,created_at:now});}
export function reserveJudge(room: LegacyRoom,now: number){
  if(room.judgement?.status!=='NOT_STARTED')return;
  room.judgement={status:'PENDING'};
  room._judge_job={job_id:crypto.randomUUID(),claimed:false,deadline_at:Math.min(now+JUDGE_MS,room.expires_at),
    parties:room.players.map((p,i)=>({side:i?'B':'A',player_id:p.player_id})),
    input:{topic:room.topic,arguments:room.arguments.map(a=>({side:a.player_id===room.players[0].player_id?'A':'B',text:a.text}))}};
  event(room,'JUDGE_REQUESTED',now);
}
export function failJudge(room: LegacyRoom,code: string,now: number){
  if(room.judgement?.status!=='PENDING')return false;
  room.judgement={status:'FAILED',error_code:code};event(room,'JUDGE_FAILED',now);return true;
}
export function tickJudge(room: LegacyRoom,now: number){
  if(['CLOSED','EXPIRED'].includes(room.status))failJudge(room,'JUDGE_CANCELLED',now);
  else if(room._judge_job&&now>=room._judge_job.deadline_at)failJudge(room,'JUDGE_TIMEOUT',now);
  return room;
}
export function claimJudge(room: LegacyRoom,now: number){
  tickJudge(room,now);
  if(room.status!=='FINISHED'||room.judgement?.status!=='PENDING'||!room._judge_job||room._judge_job.claimed)return null;
  room._judge_job.claimed=true;return structuredClone(room._judge_job);
}
export function finishJudge(room: LegacyRoom,jobId: string,outcome: JudgeOutcome,now: number){
  tickJudge(room,now);
  if(room.status!=='FINISHED'||room.judgement?.status!=='PENDING'||!room._judge_job?.claimed||room._judge_job.job_id!==jobId)return false;
  if(outcome.result){room.judgement={status:'SUCCEEDED',result:outcome.result};event(room,'JUDGE_COMPLETED',now);}
  else failJudge(room,outcome.error_code??'JUDGE_FAILED',now);
  return true;
}
export function publicJudgement(room: Pick<LegacyRoom,"judgement">){
  if(!room.judgement)return undefined;
  const {status}=room.judgement;
  const result=room.judgement.status==='SUCCEEDED'?room.judgement.result:undefined;
  const error_code=room.judgement.status==='FAILED'?room.judgement.error_code:undefined;
  if(status==='SUCCEEDED'&&result)return {status,result:{
    scores:result.scores.map(s=>({player_id:s.player_id,fit:s.fit,evidence:s.evidence,response:s.response,humor:s.humor,total:s.total,reason:s.reason})),
    winner_player_id:result.winner_player_id,summary:result.summary,
    ...(result.tie_break?{tie_break:{player_id:result.tie_break.player_id,reason:result.tie_break.reason}}:{}),
    round_comments:result.round_comments.map(c=>({round:c.round,comment:c.comment})),
  }};
  return {status,...(status==='FAILED'?{error_code}:{})};
}
