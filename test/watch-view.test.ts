import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWatchView, buildWatchUrl, authorizeWatch } from '../src/watch-view.ts';
import { hashToken } from '../src/http.ts';

const token='b'.repeat(64), id='a'.repeat(24);
const shortToken='c'.repeat(32);
const fixture=()=>({room_id:id,topic:'鸡块还是薯条',status:'ACTIVE',sequence:4,turn_index:1,max_turns:4,
  expires_at:1000,current_turn:{player_id:'B'},_watch_token:token,_watch_token_hash:'private-hash',
  players:[{player_id:'A',name:'A',agent_label:'豆包',token_hash:'player-hash',last_seen_at:1}],
  arguments:[{sequence:1,player_id:'A',text:'<script>恶意内容</script>',created_at:1,event_id:'private-event'}]});
test('观战投影仅公开对局，不含凭证、在线信息或回执',()=>{
  const view=buildWatchView(fixture());
  assert.equal(view.current_player_id,'B');
  assert.equal(view.arguments[0].text,'<script>恶意内容</script>');
  for(const secret of [token,'private-hash','player-hash','private-event','last_seen_at'])
    assert.equal(JSON.stringify(view).includes(secret),false);
  assert.equal(buildWatchUrl('http://localhost:8787',id,token),`http://localhost:8787/watch/${id}/${token}`);
  assert.equal(buildWatchUrl('http://localhost:8787',id,shortToken),`http://localhost:8787/watch/${id}/${shortToken}`);
});
test('只允许明确的公开基址及合法随机标识',()=>{
  for(const origin of [undefined,'https://room.internal','ftp://example.com','https://example.com/path','https://user:pass@example.com','https://example.com?q=x'])
    assert.throws(()=>buildWatchUrl(origin,id,token));
  assert.throws(()=>buildWatchUrl('https://example.com','bad',token));
  assert.throws(()=>buildWatchUrl('https://example.com',id,'c'.repeat(48)));
});
test('观战令牌独立、过期拒绝、不修改玩家在线时间',async()=>{
  const room=fixture(); room._watch_token_hash=await hashToken(token);
  const before=structuredClone(room);
  await authorizeWatch(room,token,100);
  await authorizeWatch({...room,_watch_token_hash:await hashToken(shortToken)},shortToken,100);
  assert.deepEqual(room,before);
  await assert.rejects(()=>authorizeWatch(room,'c'.repeat(64),100),e=>e.code==='WATCH_UNAUTHORIZED');
  await assert.rejects(()=>authorizeWatch(room,token,1000),e=>e.code==='ROOM_EXPIRED');
  await assert.rejects(()=>authorizeWatch({...room,_watch_token_hash:undefined},token,100));
});
