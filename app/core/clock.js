// Audio output timestamps anchor animation time; container A/V timestamps remain
// owned by MediaRecorder. Never infer elapsed time from encoded chunk counts.
export class AVClock {
  constructor(audio){this.audio=audio;this.origin=performance.now();this.last=0;this.audioOffset=null;this.audioRunning=false;this.skew=0;}
  now(perf=performance.now()){
    const ctx=this.audio.context;let seconds=(perf-this.origin)/1000;
    if(ctx?.state==='running'){
      const stamp=ctx.getOutputTimestamp?.();
      const audioTime=stamp?.performanceTime>0 ? stamp.contextTime+(perf-stamp.performanceTime)/1000 : ctx.currentTime;
      if(!this.audioRunning){this.audioOffset=seconds-audioTime;this.audioRunning=true;}
      seconds=audioTime+this.audioOffset;
      this.skew=1000*(seconds-(perf-this.origin)/1000);
    }else this.audioRunning=false;
    this.last=Math.max(this.last,seconds);return this.last;
  }
}
export class FrameScheduler {
  constructor(fps=30){this.fps=fps;this.next=null;this.frames=0;this.late=0;}
  due(time){const step=1/this.fps;if(this.next===null)this.next=time;if(time+0.001<this.next)return false;const missed=Math.max(0,Math.floor((time-this.next)/step));this.late+=missed;this.next+=step*(missed+1);this.frames++;return true;}
  reset(fps){this.fps=fps;this.next=null;this.frames=0;this.late=0;}
}
