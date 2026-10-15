import type { ModelEnv } from '../model-config.ts';

// 房间只依赖这组能力；Cloudflare 与单进程 Node 各自提供实现。
export interface RoomContext {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    setAlarm(time: number): Promise<void>;
    deleteAlarm(): Promise<void>;
  };
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  waitUntil(task: Promise<unknown>): void;
}
export interface AppEnv extends ModelEnv {
  MCDEBATE_PUBLIC_ORIGIN: string;
  JUDGE_ENABLED?: string;
  DEMO_TURN_MS?: string;
  SHOPPING_DATA_MODE?: string;
  ROOMS: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
}
