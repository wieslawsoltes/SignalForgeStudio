import {uid,filename,deferred,download} from './util.js';
export function chooseMime(preference='auto',Recorder=globalThis.MediaRecorder){
  if(!Recorder)throw new Error('MediaRecorder is not supported by this browser.');
  const types=preference==='mp4'?['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4']:preference==='vp9'?['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus']:['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm','video/mp4'];
  const mime=types.find(t=>Recorder.isTypeSupported(t));if(!mime)throw new Error('No supported recording codec for the selected format. Choose Automatic.');return mime;
}
export function packet(sequence,timecode,payload){const bytes=new Uint8Array(16+payload.byteLength),view=new DataView(bytes.buffer);view.setUint32(0,0x53464731);view.setUint32(4,sequence);view.setFloat64(8,timecode);bytes.set(new Uint8Array(payload),16);return bytes;}
export class OutputManager extends EventTarget {
  constructor(engine,storage,store){super();Object.assign(this,{engine,storage,store});this.recording=null;this.streaming=null;this.recordingStarting=false;this.streamingStarting=false;this.wakeLock=null;}
  emit(){this.dispatchEvent(new Event('change'));}
  error(error){this.dispatchEvent(new CustomEvent('error',{detail:error.message||String(error)}));}
  get busy(){return !!(this.recording||this.streaming||this.recordingStarting||this.streamingStarting);}
  options(mime){const s=this.store.project.settings;return {mimeType:mime,videoBitsPerSecond:s.videoBitrate,audioBitsPerSecond:s.audioBitrate};}
  async wake(){if(!this.wakeLock&&navigator.wakeLock)try{this.wakeLock=await navigator.wakeLock.request('screen');this.wakeLock.addEventListener('release',()=>{this.wakeLock=null;});}catch{}}
  release(){if(!this.busy){this.engine.releaseOutput();this.wakeLock?.release();this.wakeLock=null;}}
  async startRecording(){
    if(this.recording||this.recordingStarting)return;this.recordingStarting=true;this.emit();let stream,file;
    try{const mime=chooseMime(this.store.project.settings.codec),extension=mime.includes('mp4')?'mp4':'webm',name=filename('SignalForge',extension);
      if(this.store.project.settings.directToDisk){if(!window.showSaveFilePicker)throw new Error('Direct-to-disk requires the File System Access API. Disable it to use the recording library.');const handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:'Video recording',accept:{[mime.split(';')[0]]:['.'+extension]}}]});file=await handle.createWritable();}
      stream=await this.engine.outputStream();const recorder=new MediaRecorder(stream,this.options(mime));
      const session={id:uid(),name,mime:recorder.mimeType||mime,recorder,stream,file,seq:0,bytes:0,pending:0,chain:Promise.resolve(),startedAt:performance.now(),pausedMs:0,pausedAt:null,done:deferred(),failure:null};
      await this.storage.putRecording({id:session.id,name,mime:session.mime,created:Date.now(),state:'recording',bytes:0,direct:!!file});
      recorder.ondataavailable=e=>{if(!e.data.size)return;const seq=session.seq++;session.pending+=e.data.size;if(session.pending>128*1024*1024&&!session.failure){session.failure=new Error('Recording storage is too slow. Output stopped; earlier chunks remain recoverable.');if(recorder.state!=='inactive')recorder.stop();}
        session.chain=session.chain.then(async()=>{if(session.failure)return;if(file)await file.write(e.data);else await this.storage.append(session.id,seq,e.data);session.bytes+=e.data.size;}).catch(error=>{session.failure=error;if(recorder.state!=='inactive')recorder.stop();}).finally(()=>{session.pending-=e.data.size;});};
      recorder.onerror=e=>{session.failure=e.error||new Error('Browser encoder failed');if(recorder.state!=='inactive')recorder.stop();};
      recorder.onstop=async()=>{try{await session.chain;if(file)await file.close();const duration=this.elapsed(session);await this.storage.putRecording({id:session.id,name,mime:session.mime,created:Date.now(),state:session.failure?'partial':'ready',bytes:session.bytes,duration,direct:!!file});if(session.failure)this.error(session.failure);}catch(e){this.error(e);}finally{stream.getTracks().forEach(t=>t.stop());if(this.recording===session)this.recording=null;session.done.resolve();this.release();this.emit();}};
      this.recording=session;recorder.start(1000);await this.wake();this.emit();
    }catch(e){stream?.getTracks().forEach(t=>t.stop());try{await file?.abort();}catch{}this.recording=null;throw e;}finally{this.recordingStarting=false;this.release();this.emit();}
  }
  elapsed(session){return Math.max(0,((session.pausedAt||performance.now())-session.startedAt-(session.pausedMs||0))/1000);}
  async stopRecording(){const s=this.recording;if(!s)return;if(s.recorder.state!=='inactive')s.recorder.stop();await s.done.promise;}
  pauseRecording(){const s=this.recording;if(!s)return;if(s.recorder.state==='recording'){s.recorder.pause();s.pausedAt=performance.now();}else if(s.recorder.state==='paused'){s.recorder.resume();s.pausedMs+=performance.now()-s.pausedAt;s.pausedAt=null;}this.emit();}
  async exportRecording(meta){if(meta.direct)throw new Error('This recording was written directly to the file you selected.');const blob=await this.storage.blob(meta.id,meta.mime);if(!blob.size)throw new Error('This recording has no stored video chunks.');download(blob,meta.name);}
  async relayConfig(){let url=this.store.project.settings.relayURL,token=sessionStorage.getItem('signalforge-relay-token')||'';
    if(!url){
      if(document.querySelector('meta[name="signalforge-hosting"]')?.content==='static')throw new Error('This GitHub Pages studio supports capture, editing, and recording. Live streaming requires the included relay: run npm start locally, or configure a trusted WSS relay URL and session token in Settings.');
      const response=await fetch(new URL('api/config',document.baseURI),{cache:'no-store'});
      if(!response.ok)throw new Error('Run npm start and open the localhost studio, or configure a relay WebSocket URL and session token.');
      const config=await response.json();url=new URL('live',document.baseURI);url.protocol=location.protocol==='https:'?'wss:':'ws:';token=config.token;
    }
    const parsed=new URL(url);if(!['ws:','wss:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Relay URL must be ws:// or wss:// without embedded credentials.');if(!token)throw new Error('The relay requires the session token printed in its terminal.');return {url:parsed.href,token};
  }
  async startStreaming(){if(this.streaming||this.streamingStarting)return;this.streamingStarting=true;this.emit();let ws,stream;
    try{const mime=chooseMime(this.store.project.settings.codec),config=await this.relayConfig();ws=new WebSocket(config.url,'signalforge.v1');ws.binaryType='arraybuffer';
      await new Promise((res,rej)=>{const timer=setTimeout(()=>{ws.close();rej(new Error('Relay connection timed out'));},8000);ws.onopen=()=>{clearTimeout(timer);res();};ws.onerror=()=>{clearTimeout(timer);rej(new Error('Cannot connect to the relay. Check URL, TLS, allowed origin, and that npm start is running.'));};});
      const ready=await new Promise((res,rej)=>{const timer=setTimeout(()=>rej(new Error('Relay authentication timed out')),8000);ws.onmessage=e=>{if(typeof e.data!=='string')return;let m;try{m=JSON.parse(e.data);}catch{return;}if(m.type==='ready'){clearTimeout(timer);res(m);}else if(m.type==='error'){clearTimeout(timer);rej(new Error(m.message));}};ws.onclose=()=>{clearTimeout(timer);rej(new Error('Relay rejected the connection'));};ws.send(JSON.stringify({type:'hello',version:1,token:config.token,mime,fps:this.store.project.settings.fps,bitrate:this.store.project.settings.videoBitrate}));});
      stream=await this.engine.outputStream();const recorder=new MediaRecorder(stream,this.options(mime));const s={ws,recorder,stream,mode:ready.mode,filename:ready.filename,seq:0,acked:-1,bytes:0,chain:Promise.resolve(),startedAt:performance.now(),stopping:false,done:deferred(),encoderDone:deferred(),lastTimecode:0};
      this.streaming=s;
      ws.onmessage=e=>{if(typeof e.data!=='string')return;let m;try{m=JSON.parse(e.data);}catch{return;}if(m.type==='ack')s.acked=m.sequence;else if(m.type==='error'){this.error(new Error(m.message));this.stopStreaming().catch(e=>this.error(e));}else if(m.type==='stopped'){s.done.resolve(m);this.dispatchEvent(new CustomEvent('relaycomplete',{detail:m}));}};
      ws.onclose=()=>{s.done.resolve();if(!s.stopping){this.error(new Error('Relay disconnected. Streaming stopped; restart to create a new complete container.'));this.stopStreaming().catch(e=>this.error(e));}};
      ws.onerror=()=>this.error(new Error('Streaming WebSocket failed.'));
      recorder.ondataavailable=e=>{if(!e.data.size)return;const sequence=s.seq++,timecode=Math.max(s.lastTimecode,Number.isFinite(e.timecode)?e.timecode:performance.now()-s.startedAt);s.lastTimecode=timecode;
        s.chain=s.chain.then(async()=>{const payload=await e.data.arrayBuffer();if(ws.readyState!==WebSocket.OPEN)throw new Error('Relay closed before the final encoded chunk was delivered.');if(ws.bufferedAmount+payload.byteLength>8*1024*1024)throw new Error('Relay backpressure exceeded 8 MB. Streaming stopped without dropping container fragments.');ws.send(packet(sequence,timecode,payload));s.bytes+=payload.byteLength;}).catch(err=>{if(!s.failed){s.failed=true;this.error(err);queueMicrotask(()=>this.stopStreaming().catch(e=>this.error(e)));}});};
      recorder.onstop=()=>s.encoderDone.resolve();recorder.onerror=e=>{this.error(e.error||new Error('Streaming encoder failed'));this.stopStreaming().catch(e=>this.error(e));};recorder.start(500);s.heartbeat=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ping'}));},3000);await this.wake();this.emit();
    }catch(e){ws?.close();stream?.getTracks().forEach(t=>t.stop());this.streaming=null;throw e;}finally{this.streamingStarting=false;this.release();this.emit();}
  }
  async stopStreaming(){const s=this.streaming;if(!s||s.stopping)return;s.stopping=true;this.emit();clearInterval(s.heartbeat);
    try{if(s.recorder.state!=='inactive'){s.recorder.stop();await s.encoderDone.promise;}await s.chain;if(s.ws.readyState===WebSocket.OPEN){s.ws.send(JSON.stringify({type:'end',chunks:s.seq}));await Promise.race([s.done.promise,new Promise(resolve=>setTimeout(resolve,6500))]);}}
    finally{s.ws.close();s.stream.getTracks().forEach(t=>t.stop());if(this.streaming===s)this.streaming=null;this.release();this.emit();}
  }
  async dispose(){await Promise.all([this.stopRecording(),this.stopStreaming()]);this.release();}
}
