import { mkdir, open, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

const keySchema=z.object({room_id:z.string().regex(/^[a-f0-9]{24}$/),checkout_id:z.string().uuid()});
const recordSchema=z.object({plan_id:z.string().regex(/^[a-f0-9]{64}$/),account_hash:z.string().regex(/^[a-f0-9]{64}$/),revision:z.int().min(1),owner_pid:z.int().positive(),
  state:z.enum(['CLAIMED','DISPATCHING','UNKNOWN','ORDER_CREATED','PAID','ORDER_CANCELLED']),dispatch_at:z.number().nullable(),room_report_pending:z.boolean(),
  order_id:z.string().max(200).optional(),payment_url:z.string().max(4096).optional(),pickup_code:z.string().max(200).optional(),locker_code:z.string().max(200).optional(),locker_qr_code:z.string().max(4096).optional(),order_status:z.string().max(100).optional(),
});
export type OrderRecord=z.infer<typeof recordSchema>;
type Key={room_id:string;checkout_id:string};
function absent(error:unknown){return error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT';}
export class FileOrderJournal {
  directory:string;
  constructor(directory:string){this.directory=resolve(directory);}
  path(plan:Key){const key=keySchema.parse(plan);return join(this.directory,key.room_id+'-'+key.checkout_id+'.sqlite');}
  private async database(plan:Key){
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const path=this.path(plan),file=await open(path,'a',0o600);await file.close();
    const db=new DatabaseSync(path);
    try{
      // SQLite的系统锁随进程退出释放；单条CAS更新不会留下永久应用锁。
      db.exec('PRAGMA busy_timeout=2000; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS attempt (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL)');
      return db;
    }catch(error){db.close();throw error;}
  }
  async read(plan:Key):Promise<OrderRecord|null>{
    try{await stat(this.path(plan));}catch(error){if(absent(error))return null;throw error;}
    const db=await this.database(plan);
    try{const row=db.prepare('SELECT body FROM attempt WHERE id=1').get();return row?recordSchema.parse(JSON.parse(String(row.body))):null;}
    finally{db.close();}
  }
  async claim(plan:Key,record:Omit<OrderRecord,'revision'>):Promise<boolean>{
    const value=recordSchema.parse({...record,revision:1}),db=await this.database(plan);
    try{return db.prepare('INSERT OR IGNORE INTO attempt(id,revision,body) VALUES(1,1,?)').run(JSON.stringify(value)).changes===1;}
    finally{db.close();}
  }
  async save(plan:Key,expected:number,changes:Partial<OrderRecord>):Promise<OrderRecord>{
    const db=await this.database(plan);
    try{
      const row=db.prepare('SELECT body FROM attempt WHERE id=1').get();
      if(!row)throw new Error('ORDER_JOURNAL_CONFLICT');
      const previous=recordSchema.parse(JSON.parse(String(row.body)));if(previous.revision!==expected)throw new Error('ORDER_JOURNAL_CONFLICT');
      const value=recordSchema.parse({...previous,...changes,plan_id:previous.plan_id,account_hash:previous.account_hash,owner_pid:previous.owner_pid,revision:expected+1});
      if(db.prepare('UPDATE attempt SET revision=?,body=? WHERE id=1 AND revision=?').run(value.revision,JSON.stringify(value),expected).changes!==1)throw new Error('ORDER_JOURNAL_CONFLICT');
      return value;
    }finally{db.close();}
  }
}
