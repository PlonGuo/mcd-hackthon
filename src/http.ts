import { RoomError } from './core.ts';

export const RESPONSE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export function jsonResponse(data: unknown, status = 200) {
  return Response.json({ ok: true, data }, { status, headers: RESPONSE_HEADERS });
}

export function errorResponse(error: unknown) {
  const known = error instanceof RoomError;
  return Response.json({
    ok: false,
    error: {
      code: known ? error.code : 'INTERNAL_ERROR',
      message: known ? error.message : '服务内部错误，请稍后重试',
      expected_action: known ? error.expected_action : 'retry_later',
      retryable: known ? error.retryable : true,
    },
  }, { status: known ? error.status : 500, headers: RESPONSE_HEADERS });
}

export async function readJson(request: Request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RoomError('UNSUPPORTED_MEDIA_TYPE', '请使用 application/json', 415);
  }
  const limit = 16_384;
  if (Number(request.headers.get('Content-Length')) > limit) {
    throw new RoomError('BODY_TOO_LARGE', '请求体不能超过 16 KiB', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RoomError('INVALID_JSON', '请求体必须包含 JSON');
  const chunks = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new RoomError('BODY_TOO_LARGE', '请求体不能超过 16 KiB', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); }
  catch { throw new RoomError('INVALID_JSON', '请求体不是合法 UTF-8 JSON'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new RoomError('INVALID_ARGUMENT', '参数必须是 JSON 对象');
  }
  return data;
}

export function readBearer(request: Request) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') ?? '');
  if (!match) throw new RoomError('UNAUTHORIZED', '请提供有效的 Bearer 玩家凭证', 401, 'authenticate');
  return match[1];
}

export function newToken(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
