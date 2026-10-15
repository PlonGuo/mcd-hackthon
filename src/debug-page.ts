import { RESPONSE_HEADERS } from './http.ts';

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>McDebate · 房间通信测试</title><link rel="stylesheet" href="/debug.css"><script src="/debug.js" defer></script></head>
<body><main>
<header><p class="eyebrow">McDebate / POC 1</p><h1>房间通信测试</h1><p>两台手机打开此页，创建并加入同一房间，按回合交换观点。</p></header>
<p id="notice" role="status" aria-live="polite"></p>
<div id="setup" class="grid">
<section><h2>创建房间</h2><form id="create-form">
<label for="host-name">你的名称</label><input id="host-name" maxlength="40" required placeholder="玩家 A">
<label for="topic">辩题</label><input id="topic" maxlength="200" required value="麦乐鸡还是薯条">
<div class="grid"><div><label for="expected">预计人数</label><select id="expected"><option>2</option><option>3</option><option>4</option></select></div>
<div><label for="max-turns">总发言次数</label><select id="max-turns"><option>4</option><option>6</option><option>8</option><option>12</option></select></div></div>
<button type="submit">创建房间</button></form></section>
<section><h2>加入房间</h2><form id="join-form">
<label for="guest-name">你的名称</label><input id="guest-name" maxlength="40" required placeholder="玩家 B">
<label for="join-code">房间号</label><input id="join-code" maxlength="24" pattern="[a-f0-9]{24}" required autocomplete="off" spellcheck="false" placeholder="粘贴房主分享的房间号">
<button type="submit">加入房间</button></form><p class="hint">只分享房间号。每位玩家的身份凭证由服务端单独分配。</p></section>
</div>
<section id="room-panel" hidden>
<div class="room-heading"><h2 id="room-topic"></h2><span id="room-status" class="badge"></span></div>
<p>房间号 <code id="room-code"></code> <button id="copy" class="small" type="button">复制房间号</button></p>
<p id="identity" class="hint"></p><ul id="players"></ul>
<div class="actions"><button id="ready" type="button">准备</button><button id="start" type="button">房主开局</button>
<button id="refresh" type="button" class="secondary">刷新状态</button><button id="close" type="button" class="secondary">关闭房间</button></div>
<p id="turn" role="status" aria-live="polite"></p>
<form id="say-form"><label for="argument">你的观点（最多 200 字，建议简短）</label>
<textarea id="argument" rows="3" maxlength="200" required placeholder="先阅读上一条观点，再回应对方"></textarea>
<button id="say" type="submit">提交发言</button></form>
<h3>发言记录</h3><ol id="messages"></ol><p id="empty" class="hint">尚无发言。</p>
<button id="new-room" class="secondary" type="button" hidden>开始新的测试</button>
</section>
<footer>当前仅验证 HTTP 房间通信，没有 AI 裁判或麦当劳下单功能。回合超时后暂停，需要新建房间重测。刷新可恢复本标签页身份；关闭标签页后凭证可能丢失。</footer>
</main></body></html>`;

const css = `
:root{font-family:system-ui,-apple-system,"PingFang SC",sans-serif;color:#202020;background:#f6f5f1;line-height:1.6;color-scheme:light}
*{box-sizing:border-box}body{margin:0}main{max-width:920px;margin:0 auto;padding:24px 16px 40px}
header{margin-bottom:24px}h1{font-size:28px;margin:4px 0}h2{font-size:20px;margin:0 0 16px}h3{font-size:17px}
.eyebrow{font-size:13px;letter-spacing:.08em;font-weight:700}section{background:white;border:1px solid #deddd7;border-radius:12px;padding:20px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:1fr;gap:16px}label{display:block;font-weight:600;font-size:14px;margin-bottom:6px}
input,select,textarea{font:inherit;width:100%;border:1px solid #aaa;border-radius:6px;padding:10px;background:white;color:inherit;margin-bottom:16px}
textarea{resize:vertical}button{font:inherit;font-weight:600;border:1px solid #b89400;background:#ffd447;border-radius:6px;min-height:44px;padding:9px 16px;cursor:pointer}
button:disabled{opacity:.45;cursor:default}.secondary{background:white;border-color:#aaa}.small{font-size:13px;padding:5px 10px}
:focus-visible{outline:3px solid #2457c5;outline-offset:3px}.actions{display:flex;flex-wrap:wrap;gap:8px}.hint,footer{color:#626262;font-size:13px}footer{margin-top:24px}
#notice:empty{display:none}#notice{padding:12px;background:#fff3c8;border-radius:6px;overflow-wrap:anywhere}.room-heading{display:flex;align-items:start;gap:16px;justify-content:space-between}
.room-heading h2{min-width:0;overflow-wrap:anywhere}#players li,#identity{overflow-wrap:anywhere}.badge{background:#efefeb;padding:3px 8px;border-radius:4px;white-space:nowrap;font-size:13px;flex-shrink:0}code{overflow-wrap:anywhere;font-size:14px}
#turn{font-weight:600}#players{padding-left:20px}#messages{padding-left:24px}#messages li{padding:12px 0;border-bottom:1px solid #eee;overflow-wrap:anywhere;white-space:pre-wrap}#messages small{display:block;color:#666}
[hidden]{display:none!important}@media(min-width:700px){.grid{grid-template-columns:1fr 1fr}main{padding-top:40px}}
`;

const js = String.raw`
'use strict';
const $ = id => document.getElementById(id);
const KEY = 'mcdebate.poc1.session';
const labels = { WAITING:'等待就绪', READY:'全员就绪', ACTIVE:'辩论中', PAUSED:'回合超时，已暂停', FINISHED:'发言完成', CLOSED:'房间已关闭', EXPIRED:'房间已过期' };
let session = null, room = null, busy = false, polling = false;
try {
  const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
  if (saved && /^[a-f0-9]{24}$/.test(saved.room_id) && /^[a-f0-9]{64}$/.test(saved.player_token)) session = saved;
} catch { sessionStorage.removeItem(KEY); }
function notice(message) { $('notice').textContent = message; }
function save() { sessionStorage.setItem(KEY, JSON.stringify(session)); }
async function api(path, body, auth = true) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(10000),
    headers: { ...(body === undefined ? {} : {'Content-Type':'application/json'}),
      ...(auth && session ? {Authorization:'Bearer ' + session.player_token} : {}) },
    ...(body === undefined ? {} : {body:JSON.stringify(body)})
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = new Error(result.error?.message || '请求失败');
    Object.assign(error, result.error, {status:response.status}); throw error;
  }
  return result.data;
}
function accept(next) {
  if (!session || next.room_id !== session.room_id) return;
  if (room && (next.sequence < room.sequence || (next.sequence === room.sequence && next.server_time < room.server_time))) return;
  room = next; render();
}
function render() {
  $('setup').hidden = Boolean(session);
  $('room-panel').hidden = !room;
  document.querySelectorAll('#setup button').forEach(button => { button.disabled = busy; });
  if (!room) return;
  $('room-topic').textContent = room.topic;
  $('room-code').textContent = room.room_id;
  $('room-status').textContent = labels[room.status] || room.status;
  const me = room.players.find(player => player.player_id === session.player_id);
  $('identity').textContent = '你是 ' + (me?.name || '玩家') + (room.host_player_id === session.player_id ? '（房主）' : '');
  $('players').replaceChildren(...room.players.map(player => {
    const li = document.createElement('li');
    li.textContent = player.name + ' · ' + (player.ready ? '已准备' : '未准备') + ' · ' + (player.online ? '在线' : '近期无活动');
    return li;
  }));
  const lobby = ['WAITING','READY'].includes(room.status);
  const terminal = ['PAUSED','FINISHED','CLOSED','EXPIRED'].includes(room.status);
  $('ready').disabled = busy || !lobby;
  $('ready').textContent = me?.ready ? '取消准备' : '准备';
  $('start').disabled = busy || room.status !== 'READY' || room.host_player_id !== session.player_id;
  $('close').disabled = busy || ['CLOSED','EXPIRED'].includes(room.status) || room.host_player_id !== session.player_id;
  $('refresh').disabled = busy;
  $('say').disabled = busy || (!session.pending && (room.status !== 'ACTIVE' || room.current_turn?.player_id !== session.player_id));
  $('say').textContent = session.pending ? '重试同一条发言' : '提交发言';
  $('argument').disabled = busy || Boolean(session.pending) || room.status !== 'ACTIVE';
  $('new-room').hidden = !terminal;
  $('new-room').disabled = busy;
  $('messages').replaceChildren(...room.arguments.map(argument => {
    const li = document.createElement('li');
    const meta = document.createElement('small');
    meta.textContent = '第 ' + argument.sequence + ' 条 · ' + (room.players.find(p => p.player_id === argument.player_id)?.name || '玩家');
    li.append(meta, document.createTextNode(argument.text)); return li;
  }));
  $('empty').hidden = room.arguments.length > 0;
  updateTurn();
}
function updateTurn() {
  if (!room) return;
  if (room.current_turn) {
    const player = room.players.find(p => p.player_id === room.current_turn.player_id);
    const remaining = Math.max(0, Math.ceil((room.current_turn.deadline_at - Date.now() - clockOffset) / 1000));
    $('turn').textContent = '轮到 ' + player.name + ' · 剩余 ' + remaining + ' 秒 · ' + room.turn_index + '/' + room.max_turns + ' 条';
  } else $('turn').textContent = room.status === 'READY' ? '请房主开局。' :
    room.status === 'WAITING' ? '等待人数凑齐并全员准备。' : labels[room.status] + '。本 POC 不判定胜负。';
}
let clockOffset = 0;
async function refresh() {
  if (!session || polling) return;
  polling = true;
  try {
    const data = await api('/rooms/' + session.room_id + '/state');
    clockOffset = data.room.server_time - Date.now();
    accept(data.room);
  } finally { polling = false; }
}
async function perform(operation) {
  if (busy) return;
  busy = true; notice(''); render();
  try { await operation(); }
  catch (error) { notice(error.message + (error.code ? ' [' + error.code + ']' : '，请检查网络后重试。')); }
  finally { busy = false; render(); }
}
function connect(data) {
  session = { room_id:data.room.room_id, player_id:data.player_id, player_token:data.player_token };
  save(); clockOffset = data.room.server_time - Date.now(); accept(data.room);
}
$('create-form').addEventListener('submit', event => {
  event.preventDefault(); perform(async () => connect(await api('/rooms', {
    name:$('host-name').value, topic:$('topic').value,
    expected_players:Number($('expected').value), max_turns:Number($('max-turns').value)
  }, false)));
});
$('join-form').addEventListener('submit', event => {
  event.preventDefault(); perform(async () => connect(await api('/rooms/' + $('join-code').value.trim() + '/join', {name:$('guest-name').value}, false)));
});
$('ready').addEventListener('click', () => perform(async () => {
  const me = room.players.find(p => p.player_id === session.player_id);
  accept((await api('/rooms/' + session.room_id + '/ready', {ready:!me.ready})).room);
}));
for (const action of ['start','close']) $(action).addEventListener('click', () => perform(async () => {
  accept((await api('/rooms/' + session.room_id + '/' + action, {})).room);
}));
$('refresh').addEventListener('click', () => perform(refresh));
$('copy').addEventListener('click', () => perform(async () => {
  try { await navigator.clipboard.writeText(session.room_id); notice('房间号已复制。'); }
  catch { notice('复制不可用，请长按选中房间号复制。'); }
}));
$('say-form').addEventListener('submit', event => {
  event.preventDefault(); perform(async () => {
    if (!session.pending) {
      session.pending = {turn_id:room.current_turn.turn_id, event_id:crypto.randomUUID(), text:$('argument').value};
      save();
    }
    try {
      const data = await api('/rooms/' + session.room_id + '/say', session.pending);
      delete session.pending; save(); $('argument').value = ''; accept(data.room);
    } catch (error) {
      if (error.code && !error.retryable) { delete session.pending; save(); }
      await refresh().catch(() => {}); throw error;
    }
  });
});
$('new-room').addEventListener('click', () => {
  sessionStorage.removeItem(KEY); session = null; room = null; notice(''); render();
});
render();
if (session) refresh().catch(error => notice(error.message + '，可手动刷新页面重试。'));
setInterval(() => {
  if (session && (!room || ['WAITING','READY','ACTIVE'].includes(room.status))) {
    refresh().catch(error => notice(error.message + '，请检查网络或点击刷新状态。'));
  }
}, 2000);
setInterval(updateTurn, 500);
`;

export function debugResponse(path: string) {
  const body = path === '/debug.js' ? js : path === '/debug.css' ? css : html;
  const type = path === '/debug.js' ? 'application/javascript' : path === '/debug.css' ? 'text/css' : 'text/html';
  return new Response(body, { headers: {
    ...RESPONSE_HEADERS,
    'Content-Type': `${type}; charset=utf-8`,
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  } });
}
