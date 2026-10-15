import { nodeConfig } from './config.ts';
import { createNodeRuntime } from './rooms.ts';
import { createNodeServer } from './server.ts';

process.umask(0o077);
const config=nodeConfig(process.env);
const runtime=createNodeRuntime(config),server=createNodeServer(runtime,{release:config.release});
server.listen(config.port,'127.0.0.1',()=>console.log('McDebate Node ready; release='+config.release));
let stopping=false;
async function shutdown(){
  if(stopping)return;stopping=true;
  const deadline=setTimeout(()=>{console.error('Graceful shutdown timed out');server.closeAllConnections();process.exit(1);},70000);deadline.unref();
  const closed=new Promise<void>(resolve=>server.close(()=>resolve()));
  await runtime.close();await closed;clearTimeout(deadline);
}
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>{shutdown().catch(()=>{console.error('Shutdown failed');process.exitCode=1;});});
