import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { StoredRoom } from '../../types.ts';
import { RoomError } from '../../core.ts';

const RETENTION_MS = 24 * 60 * 60 * 1000;
export class RoomDatabase {
  private db: DatabaseSync;
  private maxRooms: number;
  constructor(path: string, maxRooms = 2000) {
    this.maxRooms = maxRooms;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    try {
      // 一个数据库只由一个 Node 进程持有，避免多个内存锁分别推进同一回合。
      this.db.exec(`PRAGMA busy_timeout=0; PRAGMA locking_mode=EXCLUSIVE; PRAGMA journal_mode=WAL;
        PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS rooms(room_id TEXT PRIMARY KEY, body TEXT NOT NULL, alarm_at INTEGER, retain_until INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS rooms_alarm ON rooms(alarm_at);
        CREATE INDEX IF NOT EXISTS rooms_retention ON rooms(retain_until);`);
      chmodSync(path, 0o600);
      // save 写入房间后如在设置 alarm 前退出，重启时也会重新检查一次。
      this.db.prepare('UPDATE rooms SET alarm_at=? WHERE retain_until>?').run(Date.now(), Date.now());
    } catch (error) { this.db.close(); throw error; }
  }
  read(id: string): StoredRoom | undefined {
    const row = this.db.prepare('SELECT body FROM rooms WHERE room_id=?').get(id);
    return row ? JSON.parse(String(row.body)) as StoredRoom : undefined;
  }
  write(id: string, room: StoredRoom) {
    if (!this.db.prepare('SELECT 1 FROM rooms WHERE room_id=?').get(id) &&
        Number(this.db.prepare('SELECT count(*) AS n FROM rooms').get()!.n) >= this.maxRooms) {
      throw new RoomError('SERVER_BUSY', '房间数量已达上限，请稍后再试', 503);
    }
    this.db.prepare(`INSERT INTO rooms(room_id,body,retain_until) VALUES(?,?,?)
      ON CONFLICT(room_id) DO UPDATE SET body=excluded.body,retain_until=excluded.retain_until`)
      .run(id, JSON.stringify(room), room.expires_at + RETENTION_MS);
  }
  setAlarm(id: string, at: number | null) { this.db.prepare('UPDATE rooms SET alarm_at=? WHERE room_id=?').run(at, id); }
  due(now: number) { return this.db.prepare('SELECT room_id FROM rooms WHERE alarm_at<=? ORDER BY alarm_at LIMIT 100').all(now).map(row => String(row.room_id)); }
  purge(now: number) {
    const ids = this.db.prepare('DELETE FROM rooms WHERE retain_until<=? RETURNING room_id').all(now);
    return ids.map(row => String(row.room_id));
  }
  close() { this.db.close(); }
}
