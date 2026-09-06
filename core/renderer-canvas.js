import {colorRGB,clamp} from './util.js';
const canvas=()=>document.createElement('canvas');
export class CanvasRenderer {
  constructor(preview,program){this.preview=preview;this.program=program;this.pc=preview.getContext('2d',{alpha:false});this.oc=program.getContext('2d',{alpha:false});this.a=canvas();this.b=canvas();this.processed=new Map();this.kind='Canvas 2D fallback';}
  resize(w,h){if(this.width===w&&this.height===h)return;this.width=w;this.height=h;for(const c of [this.preview,this.program,this.a,this.b]){c.width=w;c.height=h;}}
  chroma(visual,item){const f=item.filters;if(!f.keyEnabled)return visual.element;let p=this.processed.get(item.id);if(!p){p={canvas:canvas()};this.processed.set(item.id,p);}const key=visual.key+':'+visual.serial+JSON.stringify(f);if(p.key===key)return p.canvas;p.key=key;const scale=Math.min(1,960/visual.width);p.canvas.width=Math.max(1,Math.round(visual.width*scale));p.canvas.height=Math.max(1,Math.round(visual.height*scale));const c=p.canvas.getContext('2d',{willReadFrequently:true});c.drawImage(visual.element,0,0,p.canvas.width,p.canvas.height);const pixels=c.getImageData(0,0,p.canvas.width,p.canvas.height),d=pixels.data,rgb=colorRGB(f.keyColor);for(let i=0;i<d.length;i+=4){const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255;const distance=Math.hypot(r-rgb[0],g-rgb[1],b-rgb[2])/Math.sqrt(3);const u=clamp((distance-f.threshold)/Math.max(.001,f.softness),0,1),mask=u*u*(3-2*u),amount=(1-mask)*f.spill,gray=Math.min(r,g,b);d[i]=(r*(1-amount)+gray*amount)*255;d[i+1]=(g*(1-amount)+gray*amount)*255;d[i+2]=(b*(1-amount)+gray*amount)*255;d[i+3]*=mask;}c.putImageData(pixels,0,0);if(this.processed.size>100)this.processed.delete(this.processed.keys().next().value);return p.canvas;}
  drawScene(ctx,snapshot,registry,time){ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.filter='none';ctx.fillStyle='#030305';ctx.fillRect(0,0,this.width,this.height);ctx.save();ctx.scale(this.width/1920,this.height/1080);
    for(const item of snapshot.scene.items){if(!item.visible||item.opacity<=0)continue;const source=snapshot.sources[item.sourceId];if(!source)continue;const visual=registry.visual(source,item,time);if(!visual)continue;const el=this.chroma(visual,item),f=item.filters,c=item.crop;ctx.save();ctx.translate(item.x+item.width/2,item.y+item.height/2);ctx.rotate(item.rotation*Math.PI/180);ctx.globalAlpha=item.opacity;ctx.filter=f.brightness===1&&f.contrast===1&&f.saturation===1&&f.blur===0?'none':`brightness(${f.brightness}) contrast(${f.contrast}) saturate(${f.saturation}) blur(${f.blur}px)`;
      const sw=el.videoWidth||el.naturalWidth||el.width,sh=el.videoHeight||el.naturalHeight||el.height;ctx.drawImage(el,c.l*sw,c.t*sh,(1-c.l-c.r)*sw,(1-c.t-c.b)*sh,(c.l-.5)*item.width,(c.t-.5)*item.height,(1-c.l-c.r)*item.width,(1-c.t-c.b)*item.height);ctx.restore();}
    ctx.restore();
  }
  render(preview,from,to,p,mode,registry,time){this.drawScene(this.pc,preview,registry,time);this.drawScene(this.a.getContext('2d'),from,registry,time);const c=this.oc;c.globalAlpha=1;c.fillStyle='#000';c.fillRect(0,0,this.width,this.height);
    if(!to){c.drawImage(this.a,0,0);return;}this.drawScene(this.b.getContext('2d'),to,registry,time);
    if(mode==='dip'){c.globalAlpha=p<.5?1-p*2:p*2-1;c.drawImage(p<.5?this.a:this.b,0,0);}
    else{c.drawImage(this.a,0,0);if(mode==='wipe'){c.save();c.beginPath();c.rect(0,0,this.width*p,this.height);c.clip();c.drawImage(this.b,0,0);c.restore();}else{c.globalAlpha=p;c.drawImage(this.b,0,0);}}
    c.globalAlpha=1;
  }
  dispose(){this.processed.clear();}
}
