import {dbToGain,gainToDb,clamp} from './util.js';
export class AudioEngine extends EventTarget {
  constructor(){super();this.context=null;this.strips=new Map();this.pending=new Map();this.monitoring=false;this.initializing=null;this.worklet=false;}
  async ensure(){
    if(this.initializing)await this.initializing;
    if(!this.context){this.initializing=this.initialize();try{await this.initializing;}finally{this.initializing=null;}}
    if(this.context.state!=='running')await this.context.resume();return this.context;
  }
  async initialize(){
    const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)throw new Error('Web Audio is not supported by this browser.');
    const ctx=this.context=new Ctx({sampleRate:48000,latencyHint:'interactive'});
    this.master=ctx.createGain();this.limiter=ctx.createDynamicsCompressor();this.limiter.threshold.value=-1;this.limiter.knee.value=0;this.limiter.ratio.value=20;this.limiter.attack.value=.003;this.limiter.release.value=.15;
    this.analyser=ctx.createAnalyser();this.analyser.fftSize=1024;this.masterData=new Float32Array(1024);
    this.destination=ctx.createMediaStreamDestination();this.monitor=ctx.createGain();this.monitor.gain.value=0;
    this.master.connect(this.limiter).connect(this.analyser).connect(this.destination);this.analyser.connect(this.monitor).connect(ctx.destination);
    this.silence=ctx.createConstantSource();this.silence.offset.value=0;this.silence.connect(this.master);this.silence.start();
    try{await ctx.audioWorklet.addModule(new URL('./audio-worklet.js',import.meta.url));this.worklet=true;}catch(e){this.dispatchEvent(new CustomEvent('warning',{detail:'AudioWorklet unavailable; noise gate is bypassed. '+e.message}));}
    for(const [id,entry] of this.pending)this.attach(id,entry.kind,entry.input,entry.config);
    this.pending.clear();this.dispatchEvent(new Event('ready'));
  }
  attach(id,kind,input,config={}){
    if(!this.context){this.pending.set(id,{kind,input,config});return;}
    if(this.strips.has(id))return;
    const c=this.context;let source;
    if(kind==='stream'){if(!input.getAudioTracks().length)return;source=c.createMediaStreamSource(new MediaStream(input.getAudioTracks()));}
    else if(kind==='media')source=c.createMediaElementSource(input);
    else if(kind==='tone'){source=c.createOscillator();source.type='sine';source.frequency.value=clamp(config.frequency||440,20,20000);source.start();}
    else return;
    const hp=c.createBiquadFilter();hp.type='highpass';hp.frequency.value=20;
    const gate=this.worklet?new AudioWorkletNode(c,'signalforge-gate',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit'}):c.createGain();
    const delay=c.createDelay(2);const pan=c.createStereoPanner();const gain=c.createGain();gain.gain.value=0;
    const analyser=c.createAnalyser();analyser.fftSize=1024;
    source.connect(hp).connect(gate).connect(delay).connect(pan).connect(gain).connect(analyser).connect(this.master);
    this.strips.set(id,{source,hp,gate,delay,pan,gain,analyser,data:new Float32Array(1024),kind,last:{},level:-120,peak:-120});
    this.dispatchEvent(new Event('channels'));
  }
  detach(id){this.pending.delete(id);const s=this.strips.get(id);if(!s)return;for(const key of ['source','hp','gate','delay','pan','gain','analyser'])try{s[key].disconnect();}catch{}if(s.kind==='tone')try{s.source.stop();}catch{}this.strips.delete(id);this.dispatchEvent(new Event('channels'));}
  route(project,weights){if(!this.context)return;const c=this.context,now=c.currentTime;
    const visible=new Map();
    for(const [sceneId,weight] of weights){const scene=typeof sceneId==='object'?sceneId:project.scenes.find(s=>s.id===sceneId);for(const item of scene?.items||[]){if(item.visible)visible.set(item.sourceId,(visible.get(item.sourceId)||0)+weight);}}
    for(const [id,strip]of this.strips){const s=project.sources[id];if(!s){this.detach(id);continue;}const a=s.audio;const w=a.global?1:clamp(visible.get(id)||0,0,1);
      const values={gain:a.muted?0:dbToGain(a.db)*w,pan:a.pan,delay:a.delay/1000,hp:a.highpass};
      for(const [key,val]of Object.entries(values)){if(strip.last[key]!==val){const param=key==='gain'?strip.gain.gain:key==='pan'?strip.pan.pan:key==='delay'?strip.delay.delayTime:strip.hp.frequency;param.setTargetAtTime(val,now,.008);strip.last[key]=val;}}
      if(this.worklet){strip.gate.parameters.get('threshold').setValueAtTime(dbToGain(a.gate),now);strip.gate.parameters.get('enabled').setValueAtTime(a.gateEnabled?1:0,now);}
      if(strip.kind==='tone'&&s.config.frequency)strip.source.frequency.setTargetAtTime(clamp(s.config.frequency,20,20000),now,.02);
    }
    const masterValue=dbToGain(project.settings.masterDb);if(this.lastMaster!==masterValue){this.master.gain.setTargetAtTime(masterValue,now,.01);this.lastMaster=masterValue;}
    this.setMonitor(project.settings.monitor);
  }
  setMonitor(enabled){if(!this.context||this.monitoring===enabled)return;this.monitoring=enabled;this.monitor.gain.setTargetAtTime(enabled?1:0,this.context.currentTime,.02);}
  measure(analyser,data){analyser.getFloatTimeDomainData(data);let sum=0,peak=0;for(let i=0;i<data.length;i++){const v=data[i];sum+=v*v;peak=Math.max(peak,Math.abs(v));}return {rms:gainToDb(Math.sqrt(sum/data.length)),peak:gainToDb(peak)};}
  meters(){const out=new Map();for(const [id,s]of this.strips)out.set(id,this.measure(s.analyser,s.data));if(this.analyser)out.set('master',this.measure(this.analyser,this.masterData));return out;}
  async dispose(){for(const id of [...this.strips.keys()])this.detach(id);this.pending.clear();try{this.silence?.stop();}catch{}await this.context?.close();this.context=null;}
}
