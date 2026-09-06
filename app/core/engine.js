import {GPURenderer} from './renderer-gpu.js';
import {CanvasRenderer} from './renderer-canvas.js';
import {AVClock,FrameScheduler} from './clock.js';
import {clone,clamp} from './util.js';
export function snapshot(project,sceneId){const scene=project.scenes.find(s=>s.id===sceneId)||project.scenes[0];const sources={};for(const item of scene.items)if(project.sources[item.sourceId])sources[item.sourceId]=clone(project.sources[item.sourceId]);return {scene:clone(scene),sources};}
export class ProductionEngine extends EventTarget {
  constructor(store,media,audio,preview,program){super();Object.assign(this,{store,media,audio,preview,program});this.clock=new AVClock(audio);this.scheduler=new FrameScheduler(store.project.settings.fps);this.programState=snapshot(store.project,store.project.program);this.transition=null;this.running=false;this.stats={fps:0,submitMs:0,late:0};this.sampleAt=performance.now();this.sampleFrames=0;this.warned=false;}
  async init(){try{if(new URLSearchParams(location.search).has('canvas'))throw new Error('Canvas fallback requested');this.renderer=await GPURenderer.create(this.preview,this.program,message=>this.dispatchEvent(new CustomEvent('error',{detail:message})));}catch(error){this.fallbackReason=error.message;
      // A canvas context cannot change type once acquired.
      for(const key of ['preview','program']){const original=this[key],fresh=original.cloneNode(false);original.replaceWith(fresh);this[key]=fresh;}
      this.renderer=new CanvasRenderer(this.preview,this.program);
    }this.resize();this.syncMedia();return this;}
  resize(){const s=this.store.project.settings;this.renderer.resize(s.width,s.height);if(this.scheduler.fps!==s.fps)this.scheduler.reset(s.fps);}
  syncMedia(){const merged={...this.programState.sources,...this.transition?.from.sources,...this.transition?.to.sources,...this.store.project.sources};this.media.reconcile(merged);}
  reload(){this.transition=null;this.programState=snapshot(this.store.project,this.store.project.program);this.syncMedia();this.resize();}
  take(type=this.store.project.settings.transition){if(this.transition)return false;const p=this.store.project;const to=snapshot(p,p.preview),from=this.programState;const duration=type==='cut'?0:p.settings.transitionMs/1000;
    if(duration<=0)this.programState=to;else this.transition={from,to,start:this.clock.now(),duration,type};
    p.program=to.scene.id;if(p.settings.studio&&from.scene.id!==to.scene.id&&p.scenes.some(s=>s.id===from.scene.id))p.preview=from.scene.id;
    this.store.emit('Take scene');this.syncMedia();this.dispatchEvent(new Event('take'));return true;
  }
  render(perf){if(!this.running)return;this.handle=requestAnimationFrame(t=>this.render(t));const time=this.clock.now(perf);if(!this.scheduler.due(time))return;const start=performance.now();const p=this.store.project;const preview={scene:this.store.scene(),sources:p.sources};let from=this.programState,to=null,progress=0,mode='fade',weights=[[from.scene,1]];
    if(this.transition){const tr=this.transition;progress=clamp((time-tr.start)/tr.duration,0,1);mode=tr.type;from=tr.from;to=tr.to;weights=[[from.scene,Math.cos(progress*Math.PI/2)],[to.scene,Math.sin(progress*Math.PI/2)]];if(progress>=1){this.programState=to;this.transition=null;from=to;to=null;weights=[[from.scene,1]];this.syncMedia();this.dispatchEvent(new Event('transitionend'));}}
    this.audio.route({...p,sources:{...from.sources,...to?.sources,...p.sources}},weights);
    try{this.renderer.render(preview,from,to,progress,mode,this.media,time);this.captureTrack?.requestFrame?.();this.dispatchEvent(new CustomEvent('frame',{detail:{time,progress,transition:!!to}}));}catch(e){if(!this.warned){this.warned=true;this.dispatchEvent(new CustomEvent('error',{detail:e.message}));}}
    this.stats.submitMs=this.stats.submitMs*.9+(performance.now()-start)*.1;this.stats.late=this.scheduler.late;this.sampleFrames++;if(perf-this.sampleAt>1000){this.stats.fps=this.sampleFrames*1000/(perf-this.sampleAt);this.sampleAt=perf;this.sampleFrames=0;this.dispatchEvent(new Event('stats'));}
  }
  start(){if(this.running)return;this.running=true;this.handle=requestAnimationFrame(t=>this.render(t));}
  async outputStream(){await this.media.startMedia();if(!this.captureStream){if(!this.program.captureStream)throw new Error('Canvas recording is not available in this browser.');this.captureStream=this.program.captureStream(this.store.project.settings.fps);this.captureTrack=this.captureStream.getVideoTracks()[0];}const audioTrack=this.audio.destination.stream.getAudioTracks()[0];return new MediaStream([this.captureTrack.clone(),audioTrack.clone()]);}
  releaseOutput(){this.captureStream?.getTracks().forEach(t=>t.stop());this.captureStream=null;this.captureTrack=null;}
  dispose(){this.running=false;cancelAnimationFrame(this.handle);this.releaseOutput();this.renderer?.dispose();}
}
