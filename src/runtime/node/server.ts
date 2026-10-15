import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { jsonResponse } from '../../http.ts';
import type { NodeRuntime } from './rooms.ts';

export function createNodeServer(runtime: NodeRuntime,{release='development'}={}) {
  const origin=new URL(runtime.env.MCDEBATE_PUBLIC_ORIGIN!);
  const server=createServer(async(req,res)=>{
    const abort=new AbortController();
    res.once('close',()=>abort.abort());
    req.once('aborted',()=>abort.abort());
    try{
      // URL 使用配置值；不信任客户端 Forwarded / X-Forwarded-*。
      if(!req.url?.startsWith('/')||req.url.startsWith('//')||req.url.includes('\\')||req.headers.host!==origin.host){res.writeHead(403);res.end('Invalid Host');return;}
      const headers=new Headers();
      for(const [name,value] of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(','):value);
      const method=req.method??'GET',body=['GET','HEAD'].includes(method)?undefined:Readable.toWeb(req);
      const request=new Request(new URL(req.url,origin),{method,headers,signal:abort.signal,...(body?{body,duplex:'half'}:{})} as RequestInit);
      const response=new URL(request.url).pathname==='/health'&&method==='GET'
        ?jsonResponse({service:'mcdebate-room-poc',runtime:'node',version:'0.6.2',release})
        :await runtime.fetch(request);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.flushHeaders();
      if(response.body&&method!=='HEAD')await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),res);
      else res.end();
    }catch(error){
      if(!abort.signal.aborted){console.error('HTTP request failed:',error instanceof Error?error.name:'Unknown');if(!res.headersSent)res.writeHead(500);res.end();}
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  return server;
}
