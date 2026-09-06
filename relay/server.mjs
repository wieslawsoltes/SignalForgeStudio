import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { createReadStream,createWriteStream,mkdirSync,statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { authenticate,parsePacket,validateHello,ffmpegArgs } from './protocol.mjs';
const HOST=process.env.SF_HOST||'127.0.0.1',PORT=Number(process.env.PORT||8787),TOKEN=process.env.SF_RELAY_TOKEN||randomBytes(32).toString('hex');
const root=fileURLToPath(new URL('../app/',import.meta.url)),recordings=fileURLToPath(new URL('../recordings/',import.meta.url));
const origins=new Set([`http://127.0.0.1:${PORT}`,`http://localhost:${PORT}`,...(process.env.SF_ALLOWED_ORIGINS||'').split(',').filter(Boolean)]);
const hosts=new Set([`127.0.0.1:${PORT}`,`localhost:${PORT}`,...[...origins].map(x=>new URL(x).host)]);
const maxClients=Math.max(1,Number(process.env.SF_MAX_SESSIONS||1));
const destination=process.env.SF_RTMP_URL||'';
if(destination)ffmpegArgs({fps:30,bitrate:8000000},destination);
mkdirSync(recordings,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webm':'video/webm','.mp4':'video/mp4'};
const server=http.createServer((req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
  if(!hosts.has(req.headers.host)||req.headers.origin&&!origins.has(req.headers.origin)){res.writeHead(403);res.end('Forbidden origin or host');return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  if(pathname==='/api/config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({version:1,token:TOKEN,mode:destination?'rtmp':'archive',protocol:'signalforge.v1'}));return;}
  if(pathname==='/api/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,mode:destination?'rtmp':'archive',clients:active.size}));return;}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root)||pathname.includes('\0')){res.writeHead(403);res.end();return;}
  try{if(!statSync(file).isFile())throw new Error();res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' ws: wss: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");if(req.method==='HEAD'){res.end();return;}const s=createReadStream(file);s.on('error',()=>res.destroy());s.pipe(res);}catch{res.writeHead(404);res.end('Not found');}
});
const wss=new WebSocketServer({noServer:true,maxPayload:16*1024*1024,perMessageDeflate:false,handleProtocols:protocols=>protocols.has('signalforge.v1')?'signalforge.v1':false});
const active=new Set();
server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/live'||!hosts.has(req.headers.host)||!origins.has(req.headers.origin)||!String(req.headers['sec-websocket-protocol']||'').split(/,\s*/).includes('signalforge.v1')){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
wss.on('connection',ws=>{
  let authenticated=false,ended=false,sequence=0,lastTimecode=0,pending=0,total=0,sink,child,fileName,lastActivity=Date.now(),completed=false;
  const send=data=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));};
  const fail=message=>{send({type:'error',message});ws.close(1011,'Relay session failed');cleanup();};
  const cleanup=()=>{clearInterval(watchdog);active.delete(ws);if(sink&&!sink.writableEnded)sink.end();if(child&&!child.killed){const timer=setTimeout(()=>child.kill('SIGKILL'),5000);timer.unref();}};
  const finish=(code=0)=>{if(completed)return;completed=true;if(code!==0){fail('FFmpeg failed. Check the relay terminal and destination configuration.');return;}send({type:'stopped',bytes:total,chunks:sequence,filename:fileName||null,mode:destination?'rtmp':'archive'});cleanup();};
  const watchdog=setInterval(()=>{if(Date.now()-lastActivity>(authenticated?15000:5000))fail('Relay session timed out');},1000);watchdog.unref();
  ws.on('message',(data,isBinary)=>{lastActivity=Date.now();try{
    if(!isBinary&&data.length>16384)throw new Error('Control message too large');
    if(!authenticated){if(isBinary)throw new Error('Authenticate before sending media');const hello=validateHello(JSON.parse(data.toString()));if(!authenticate(hello.token,TOKEN))throw new Error('Invalid relay token');if(active.size>=maxClients)throw new Error('The relay session limit has been reached');authenticated=true;active.add(ws);
      if(destination){child=spawn(process.env.SF_FFMPEG||'ffmpeg',ffmpegArgs(hello,destination),{stdio:['pipe','ignore','pipe'],shell:false});sink=child.stdin;child.on('error',()=>fail('Unable to start FFmpeg. Install it and verify SF_FFMPEG.'));child.on('close',code=>finish(code??1));child.stderr.on('data',data=>{let text=data.toString().split(destination).join('[redacted destination]');text=text.replace(/rtmps?:\/\/[^\s]+/g,'[redacted RTMP URL]');process.stderr.write('[ffmpeg] '+text);});}
      else{fileName=`SignalForge-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomBytes(4).toString('hex')}.${hello.mime.includes('mp4')?'mp4':'webm'}`;sink=createWriteStream(path.join(recordings,fileName),{flags:'wx'});sink.on('finish',()=>finish());}
      sink.on('error',()=>fail('Relay output failed. Check disk space, permissions, FFmpeg, and network connectivity.'));
      send({type:'ready',version:1,mode:destination?'rtmp':'archive',filename:fileName||null,maxBufferedBytes:8*1024*1024});return;
    }
    if(isBinary){if(ended)throw new Error('Media received after end');const p=parsePacket(data,sequence,lastTimecode);sequence++;lastTimecode=p.timecode;pending+=p.payload.length;if(pending>16*1024*1024)throw new Error('Relay sink backpressure limit reached');total+=p.payload.length;
      sink.write(p.payload,error=>{pending-=p.payload.length;if(error){fail('Relay sink rejected encoded data');return;}send({type:'ack',sequence:p.sequence,bytes:total,pendingBytes:pending,timecode:p.timecode});});
    }else{const message=JSON.parse(data.toString());if(message.type==='ping'){send({type:'pong'});return;}if(message.type!=='end'||ended)throw new Error('Unexpected control message');if(message.chunks!==sequence)throw new Error('Final chunk count mismatch');ended=true;sink.end();}
  }catch(error){fail(error.message||'Invalid relay packet');}});
  ws.on('close',cleanup);ws.on('error',cleanup);
});
server.listen(PORT,HOST,()=>{console.log(`\nSignalForge Studio\n  Studio: http://127.0.0.1:${PORT}\n  Relay:  ws://127.0.0.1:${PORT}/live\n  Mode:   ${destination?'RTMP publishing (destination redacted)':'Archive to '+recordings}\n  Token:  ${TOKEN}\n\nKeep this token private. The localhost studio retrieves it automatically.\n`);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const ws of active)ws.close(1001,'Server shutting down');wss.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),6000).unref();});
