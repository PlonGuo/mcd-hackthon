import { DurableObject } from 'cloudflare:workers';
import { RoomError } from './core.ts';
import { RoomController } from './room-object.ts';
import { jsonResponse, errorResponse } from './http.ts';
import { debugResponse } from './debug-page.ts';
import { handleRoomRequest, handleWatchRequest } from './room-service.ts';
import { handleMcpRequest } from './mcp.ts';
import { watchPageResponse } from './watch-page.ts';

function invalidRoute() { return errorResponse(new RoomError('NOT_FOUND', '接口不存在', 404)); }
function wrongMethod() { return errorResponse(new RoomError('METHOD_NOT_ALLOWED', '请求方法不支持', 405)); }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if(['/watch.css','/watch.js'].includes(url.pathname))
      return request.method==='GET' ? watchPageResponse(url.pathname) : wrongMethod();
    if (['/', '/debug', '/debug.js', '/debug.css'].includes(url.pathname)) {
      return request.method === 'GET' ? debugResponse(url.pathname) : wrongMethod();
    }
    if (url.pathname === '/health') {
      return request.method === 'GET' ? jsonResponse({ service: 'mcdebate-room-poc', phase: 'POC1' }) : wrongMethod();
    }
    try {
      if (url.pathname === '/mcp') return await handleMcpRequest(request, env, ctx);
      return await handleWatchRequest(request, env) ?? await handleRoomRequest(request, env) ?? invalidRoute();
    } catch (error) {
      console.error('Worker request failed:', error instanceof Error ? error.name : 'Unknown');
      return errorResponse(error);
    }
  },
};

export class RoomDurableObject extends DurableObject<Env> {
  room: RoomController;
  constructor(ctx: DurableObjectState,env: Env){super(ctx,env);this.room=new RoomController(ctx,env);}
  fetch(request: Request){return this.room.fetch(request);}
  alarm(){return this.room.alarm();}
}
