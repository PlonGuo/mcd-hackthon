import { createServer, type ServerResponse } from 'node:http';
import { watchPageResponse } from '../../src/watch-page.ts';
import type { shoppingWatchView } from '../../src/shopping/room.ts';
import type { Item, Judgement } from '../../src/shopping/types.ts';

export type PreviewState = ReturnType<typeof shoppingWatchView>;

/** Local visual fixture only: no model, MCP, credentials or real orders. */
export function previewSnapshot(step: number): PreviewState {
  const now = Date.now();
  const item = (side: 'A' | 'B', name: string, price: number): Item => ({
    item_id: side, version: 1, reporter_player_id: side, store_code: 'PREVIEW',
    meal_code: side, name, spec: '单份', unit_price_cents: price,
    queried_at: now, received_at: now, source: 'TEST_FIXTURE',
  });
  const a = item('A', '麦乐鸡 5 块', 1250), b = item('B', '中薯条', 1500);
  const texts = [
    '我投麦乐鸡一票。一盒五块，正好边聊边分着吃；外酥里嫩，再蘸一口糖醋酱，快乐是按块计算的。',
    '薯条才是聚餐里的气氛担当！细细一根，随手一拿，不打断聊天。刚出锅时那一口咸香，你真的舍得错过？',
    '承认热薯条很香，但我们可能聊着聊着就忘了吃。麦乐鸡更适合慢慢分享，分量也好安排。今天这一餐，我更看重吃得从容。',
    '慢慢聊也能一起吃呀。薯条的优势就是轻松，人人都能伸手拿一根。要是主食已经选好了，这一份香脆正适合补齐快乐。',
  ];
  const argumentsList = texts.slice(0, Math.min(step, 4)).map((text, index) => ({
    sequence: index + 1, event_sequence: index + 1, turn_id: 'preview-' + index,
    player_id: index % 2 ? 'B' : 'A', text, created_at: now,
  }));
  const judgement: Judgement = step < 4 ? {status: 'NOT_STARTED'} : step === 4 ? {status: 'PENDING'} : {
    status: 'SUCCEEDED',
    result: {
      winner_player_id: 'A', tie_break: null,
      scores: [
        {player_id: 'A', fit: 36, evidence: 25, response: 18, humor: 8, total: 87,
          reason: '把分享方式和用餐节奏联系起来，也回应了薯条的口感优势。'},
        {player_id: 'B', fit: 34, evidence: 23, response: 17, humor: 9, total: 83,
          reason: '分享场景鲜明，表达有趣；对等待后口感的回应仍可更具体。'},
      ],
      summary: '麦乐鸡方更贴合这次边聊边吃的场景。薯条方的氛围感也很有说服力，最终要吃什么，仍由你们决定。',
      round_comments: [
        {round: 1, comment: '一方强调按块分享，一方主打即刻的香脆，各有吸引力。'},
        {round: 2, comment: '麦乐鸡方进一步说明了用餐节奏，理由与场景结合得更紧。'},
      ],
    },
  };
  const turn = step < 4 ? {turn_id: 'preview-' + step, player_id: step % 2 ? 'B' : 'A', deadline_at: now + 120000} : null;
  const battle: PreviewState['battles'][number] = {
    battle_id: 'preview-battle', topic: '麦乐鸡，还是薯条？', status: step < 4 ? 'ACTIVE' : step === 4 ? 'JUDGING' : 'FINISHED',
    candidates: {A: a, B: b}, ready: {A: true, B: true}, arguments: argumentsList,
    current_turn: turn, judgement, recommendation: null,
  };
  return {
    mode: 'shopping', room_id: 'local-ui-preview', topic: battle.topic, status: 'OPEN', sequence: step + 1,
    turn_index: argumentsList.length, max_turns: 4, current_player_id: turn?.player_id ?? null,
    players: [{player_id: 'A', name: '麦乐鸡派', agent_label: 'A 的 Agent'},
      {player_id: 'B', name: '薯条派', agent_label: 'B 的 Agent'}],
    arguments: argumentsList, judgement, context: {
      version: 1, store_code: 'PREVIEW', name: '本地演示餐厅', address: '仅用于界面预览', fulfillment: 'SELF_PICKUP', source: 'TEST_FIXTURE',
    },
    draft: {version: 1, lines: [
      {line_id: 'line-a', owner_player_id: 'A', item: a, quantity: 1},
      {line_id: 'line-b', owner_player_id: 'B', item: b, quantity: 1},
    ], total_cents: 2750},
    active_battle_id: step < 5 ? battle.battle_id : null, battles: [battle], data_source: 'TEST_FIXTURE', checkout: null,
  };
}

export async function createWatchPreview({port = 0, autoplay = false} = {}) {
  let state = previewSnapshot(0);
  const streams = new Set<ServerResponse>();
  const timers = new Set<ReturnType<typeof setInterval>>();
  const send = (response: ServerResponse, snapshot: PreviewState) => response.write('event: snapshot\ndata: ' + JSON.stringify(snapshot) + '\n\n');
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path === '/watch/preview/snapshot') {
      response.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
      response.end(JSON.stringify({ok: true, data: autoplay ? previewSnapshot(0) : state})); return;
    }
    if (path === '/watch/preview/events') {
      response.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store'});
      streams.add(response); send(response, autoplay ? previewSnapshot(0) : state);
      let timer: ReturnType<typeof setInterval> | undefined;
      if (autoplay) {
        let step = 0;
        timer = setInterval(() => {
          send(response, previewSnapshot(++step));
          if (step === 5) { clearInterval(timer); timers.delete(timer!); }
        }, 5000);
        timers.add(timer);
      }
      response.on('close', () => { streams.delete(response); if (timer) { clearInterval(timer); timers.delete(timer); } });
      return;
    }
    if (!['/', '/watch/preview', '/watch.css', '/watch.js'].includes(path)) { response.writeHead(404).end(); return; }
    const result = watchPageResponse(path);
    response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text());
  });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing preview address');
  return {
    url: 'http://127.0.0.1:' + address.port + '/watch/preview',
    publish(next: PreviewState) { state = next; for (const response of streams) send(response, state); },
    disconnect() { for (const response of streams) response.end(); streams.clear(); },
    async close() {
      for (const timer of timers) clearInterval(timer);
      for (const response of streams) response.end();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
