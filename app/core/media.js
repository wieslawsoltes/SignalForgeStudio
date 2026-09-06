import {clamp,uid} from './util.js';
const procedural=new Set(['generator','text','lowerthird','badge','countdown','color']);
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
function roundRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);}
function trackingText(c,text,x,y,spacing=0){if('letterSpacing'in c){c.letterSpacing=spacing+'px';c.fillText(text,x,y);c.letterSpacing='0px';return;}c.fillText(text,x,y);}
function drawAurora(c,w,h,t,accent){c.save();c.scale(w/1920,h/1080);const g=c.createLinearGradient(0,0,1920,1080);g.addColorStop(0,'#161228');g.addColorStop(.55,'#1b1634');g.addColorStop(1,'#211940');c.fillStyle=g;c.fillRect(0,0,1920,1080);
  const glow=c.createRadialGradient(1520,475,20,1480,530,810);glow.addColorStop(0,'#67519a99');glow.addColorStop(.5,'#68499838');glow.addColorStop(1,'#24163100');c.fillStyle=glow;c.fillRect(0,0,1920,1080);
  c.strokeStyle='#c0a6ff0b';c.lineWidth=1;for(let x=0;x<1920;x+=80){c.beginPath();c.moveTo(x,0);c.lineTo(x,1080);c.stroke();}for(let y=0;y<1080;y+=80){c.beginPath();c.moveTo(0,y);c.lineTo(1920,y);c.stroke();}
  c.save();c.translate(1480,520);c.rotate(-.46+Math.sin(t*.12)*.04);const halo=c.createRadialGradient(0,0,25,0,0,365);halo.addColorStop(0,'#a291d91c');halo.addColorStop(.76,'#b495ff0c');halo.addColorStop(.96,'#c5a6fc22');halo.addColorStop(1,'#cbb6ff00');c.fillStyle=halo;c.beginPath();c.arc(0,0,365,0,Math.PI*2);c.fill();
  for(let i=-18;i<=18;i++){const u=i/19,r=Math.sqrt(1-u*u)*340;c.strokeStyle=`rgba(184,155,241,${.11+.22*(1-Math.abs(u))})`;c.lineWidth=1.4;c.beginPath();c.ellipse(u*44,u*328,r,r*.27,Math.sin(t*.09)*.13,0,Math.PI*2);c.stroke();}
  for(let i=0;i<24;i++){const angle=i/24*Math.PI+t*.018;const rx=Math.abs(Math.cos(angle))*340;c.strokeStyle=`rgba(189,157,251,${.12+.08*Math.sin(angle)})`;c.beginPath();c.ellipse(0,0,Math.max(2,rx),340,0,0,Math.PI*2);c.stroke();}
  c.strokeStyle=accent||'#b79af0';c.globalAlpha=.6;c.lineWidth=2;c.beginPath();c.ellipse(0,0,407,101,.2,0,Math.PI*2);c.stroke();const phase=t*.13;const px=407*Math.cos(phase),py=101*Math.sin(phase);c.fillStyle='#dfd3ff';c.shadowColor='#d0b7ff';c.shadowBlur=25;c.beginPath();c.arc(px,py,6,0,Math.PI*2);c.fill();c.restore();
  const shade=c.createLinearGradient(0,0,1500,0);shade.addColorStop(0,'#151125b3');shade.addColorStop(.7,'#1511255c');shade.addColorStop(1,'#15112500');c.fillStyle=shade;c.fillRect(0,0,1920,1080);
  c.fillStyle='#aaa0bd';c.font='500 19px system-ui';trackingText(c,'INDEPENDENT VOICES.  SHARED FREQUENCIES.',132,1030,3);c.strokeStyle='#c4b3e320';c.beginPath();c.moveTo(132,996);c.lineTo(1785,996);c.stroke();c.restore();
}
export class MediaRegistry extends EventTarget {
  constructor(storage,audio){super();this.storage=storage;this.audio=audio;this.entries=new Map();this.sources={};this.serial=0;}
  notify(){this.dispatchEvent(new Event('change'));}
  reconcile(sources){this.sources=sources;for(const id of [...this.entries.keys()])if(!Object.hasOwn(sources,id))this.remove(id);for(const source of Object.values(sources)){if(!this.entries.has(source.id)){const e={id:source.id,type:source.type,status:procedural.has(source.type)?'Ready':'Disconnected',rasters:new Map(),serial:0};this.entries.set(source.id,e);if(['image','video','audio'].includes(source.type))this.loadAsset(source).catch(err=>{e.status=err.message;this.notify();});if(source.type==='tone'){this.audio.attach(source.id,'tone',null,source.config);e.status='Test signal';}}
      const e=this.entries.get(source.id);if(e?.element&&['video','audio'].includes(source.type))e.element.loop=source.config.loop!==false;
    }}
  async loadAsset(source){const e=this.entries.get(source.id);if(!e)return;e.status='Loading…';const file=await this.storage.getAsset(source.config.assetId);if(!file)throw new Error('Asset missing — relink file');if(this.entries.get(source.id)!==e)return;
    const url=URL.createObjectURL(file);e.url=url;
    if(source.type==='image'){const img=new Image();img.src=url;await img.decode();if(this.entries.get(source.id)!==e)return;e.element=img;e.serial++;e.status='Ready';}
    else{const v=document.createElement(source.type==='audio'?'audio':'video');v.preload='auto';v.playsInline=true;v.loop=source.config.loop!==false;v.crossOrigin='anonymous';v.src=url;e.element=v;
      await new Promise((res,rej)=>{const timer=setTimeout(()=>{cleanup();rej(new Error('Media loading timed out'));},20000);const cleanup=()=>{clearTimeout(timer);v.removeEventListener('loadeddata',ready);v.removeEventListener('error',error);};const ready=()=>{cleanup();res();};const error=()=>{cleanup();rej(new Error('Media format is not supported by this browser'));};v.addEventListener('loadeddata',ready);v.addEventListener('error',error);v.load();});
      if(this.entries.get(source.id)!==e)return;this.audio.attach(source.id,'media',v);e.hasAudio=true;e.status='Ready';this.trackFrames(e);if(this.audio.context?.state==='running')v.play().catch(()=>{});
    }this.notify();
  }
  trackFrames(e){const v=e.element;if(!v?.requestVideoFrameCallback)return;const tick=(now,m)=>{if(this.entries.get(e.id)!==e)return;e.serial++;e.frameTime=m.mediaTime;e.captureTime=m.captureTime??null;e.expectedDisplayTime=m.expectedDisplayTime;e.frameHandle=v.requestVideoFrameCallback(tick);};e.frameHandle=v.requestVideoFrameCallback(tick);}
  async capture(source,deviceId=''){
    if(!navigator.mediaDevices)throw new Error('Capture needs HTTPS or localhost and browser media support.');
    const old=this.entries.get(source.id);if(old?.pending)return;const e=old||{id:source.id,type:source.type,rasters:new Map(),serial:0};this.entries.set(source.id,e);e.pending=true;e.status='Permission requested…';this.notify();
    let stream;
    try{
      if(source.type==='screen'){if(!navigator.mediaDevices.getDisplayMedia)throw new Error('Screen capture is unavailable in this browser.');stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:60}},audio:true,systemAudio:'include',surfaceSwitching:'include'});}
      else if(source.type==='camera')stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30},...(deviceId?{deviceId:{exact:deviceId}}:{})},audio:source.config.includeAudio===true});
      else stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:source.config.echoCancellation!==false,noiseSuppression:source.config.noiseSuppression!==false,autoGainControl:false,...(deviceId?{deviceId:{exact:deviceId}}:{})}});
      if(!Object.hasOwn(this.sources,source.id)){stream.getTracks().forEach(t=>t.stop());return;}
      this.releaseEntry(e);this.audio.detach(source.id);e.stream=stream;e.hasAudio=stream.getAudioTracks().length>0;e.status='Live';e.serial++;
      if(stream.getVideoTracks().length){const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.srcObject=stream;e.element=video;await video.play();this.trackFrames(e);}
      this.audio.attach(source.id,'stream',stream);
      for(const track of stream.getTracks())track.addEventListener('ended',()=>{if(e.stream!==stream)return;if(track.kind==='video'||!stream.getVideoTracks().length){e.status='Capture ended — reconnect';this.releaseEntry(e);this.audio.detach(source.id);this.notify();}},{once:true});
    }catch(err){e.status=err.name==='NotAllowedError'?'Permission denied — reconnect':err.message;throw err;}finally{e.pending=false;this.notify();}
  }
  async startMedia(){await this.audio.ensure();for(const e of this.entries.values())if(e.element instanceof HTMLMediaElement&&e.element.src&&!e.stream)await e.element.play().catch(()=>{});}
  visual(source,item,time){const e=this.entries.get(source.id);if(!e)return null;
    if(['microphone','audio','tone'].includes(source.type))return null;
    if(!procedural.has(source.type)){
      const el=e.element;if(el instanceof HTMLVideoElement&&el.readyState>=2){return {key:source.id,element:el,width:el.videoWidth,height:el.videoHeight,serial:el.requestVideoFrameCallback?e.serial:el.currentTime};}
      if(el instanceof HTMLImageElement&&el.complete&&el.naturalWidth)return {key:source.id,element:el,width:el.naturalWidth,height:el.naturalHeight,serial:e.serial};
      return this.placeholder(e,item,source.name);
    }
    const isGenerator=source.type==='generator', w=isGenerator?1280:Math.min(1920,Math.max(16,Math.round(item.width))),h=isGenerator?720:Math.min(1080,Math.max(16,Math.round(item.height)));
    const key=`${w}x${h}:${JSON.stringify(source.config)}`;let r=e.rasters.get(key);if(!r){r={canvas:canvas(w,h),serial:0};e.rasters.set(key,r);if(e.rasters.size>8)e.rasters.delete(e.rasters.keys().next().value);}
    const config=source.config;const stamp=JSON.stringify(config)+(isGenerator?Math.floor(time*20):source.type==='countdown'?Math.floor(time):'');
    if(stamp!==r.stamp){r.stamp=stamp;r.serial++;const c=r.canvas.getContext('2d');c.clearRect(0,0,w,h);c.save();const sx=w/item.width,sy=h/item.height;if(!isGenerator)c.scale(sx,sy);const W=isGenerator?w:item.width,H=isGenerator?h:item.height;
      if(isGenerator)drawAurora(c,w,h,time,config.color);
      else if(source.type==='color'){c.fillStyle=config.color||'#795ded';c.fillRect(0,0,W,H);}
      else if(source.type==='text'){const size=clamp(Number(config.fontSize)||64,8,400);c.fillStyle=config.color||'#ffffff';c.font=`${config.weight||500} ${size}px system-ui, sans-serif`;c.textBaseline='top';c.textAlign=config.align||'left';const x=c.textAlign==='center'?W/2:c.textAlign==='right'?W-8:8;String(config.text||'Text').split('\n').forEach((line,i)=>trackingText(c,line,x,8+i*size*1.17,Number(config.tracking)||0));}
      else if(source.type==='lowerthird'){c.fillStyle='#13121ec7';roundRect(c,0,0,W,H,10);c.fill();c.fillStyle=config.color||'#af95ff';c.fillRect(0,0,5,H);c.fillStyle='#ede8fb';c.font='600 37px system-ui';c.fillText(config.title||'Your name',30,52);c.fillStyle='#a89ebb';c.font='500 18px system-ui';trackingText(c,config.subtitle||'YOUR TITLE',31,91,2.3);}
      else if(source.type==='badge'){c.fillStyle='#2b243caa';c.strokeStyle='#cbb5ff35';roundRect(c,1,1,W-2,H-2,7);c.fill();c.stroke();c.fillStyle=config.color||'#bca7ff';c.beginPath();c.arc(29,H/2,5,0,Math.PI*2);c.fill();c.fillStyle='#e4ddf3';c.font='600 22px system-ui';trackingText(c,config.text||'LIVE',48,H/2+8,1.9);}
      else if(source.type==='countdown'){e.countStart??=time;const remain=Math.max(0,Math.ceil((Number(config.seconds)||300)-(time-e.countStart)));const text=`${String(Math.floor(remain/60)).padStart(2,'0')}:${String(remain%60).padStart(2,'0')}`;c.fillStyle=config.color||'#bfa8ff';c.font=`600 ${clamp(Number(config.fontSize)||158,16,350)}px ui-monospace, monospace`;c.textAlign='center';c.textBaseline='middle';c.fillText(text,W/2,H/2);}
      c.restore();
    }return {key:source.id+':'+key,element:r.canvas,width:w,height:h,serial:r.serial};
  }
  placeholder(e,item,name){const key='placeholder';let r=e.rasters.get(key);const stamp=name+e.status;if(!r){r={canvas:canvas(960,540),serial:0};e.rasters.set(key,r);}if(stamp!==r.stamp){r.stamp=stamp;r.serial++;const c=r.canvas.getContext('2d');c.fillStyle='#1c2029';c.fillRect(0,0,960,540);c.strokeStyle='#333846';for(let x=0;x<960;x+=60){c.beginPath();c.moveTo(x,0);c.lineTo(x,540);c.stroke();}c.fillStyle='#b0a2db';c.textAlign='center';c.font='500 32px system-ui';c.fillText(name,480,246);c.fillStyle='#9997a6';c.font='22px system-ui';c.fillText(e.status||'Reconnect input',480,291);}return {key:e.id+':placeholder',element:r.canvas,width:960,height:540,serial:r.serial};}
  async relink(source,file){this.remove(source.id);source.config.assetId=await this.storage.asset(file);this.reconcile(this.sources);}
  releaseEntry(e){if(e.element instanceof HTMLMediaElement){if(e.frameHandle)e.element.cancelVideoFrameCallback?.(e.frameHandle);e.element.pause();e.element.srcObject=null;e.element.removeAttribute('src');e.element.load();}e.element=null;if(e.stream){const stream=e.stream;e.stream=null;stream.getTracks().forEach(t=>t.stop());}if(e.url){URL.revokeObjectURL(e.url);e.url=null;}e.serial++;}
  remove(id){const e=this.entries.get(id);if(!e)return;this.releaseEntry(e);this.audio.detach(id);this.entries.delete(id);}
  dispose(){for(const id of [...this.entries.keys()])this.remove(id);}
}
