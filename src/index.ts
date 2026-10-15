import { DurableObject } from 'cloudflare:workers';
import { RoomController } from './room-object.ts';
export { default } from './app.ts';

export class RoomDurableObject extends DurableObject<Env> {
  room: RoomController;
  constructor(ctx: DurableObjectState,env: Env){super(ctx,env);this.room=new RoomController(ctx,env);}
  fetch(request: Request){return this.room.fetch(request);}
  alarm(){return this.room.alarm();}
}
