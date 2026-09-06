import {colorRGB} from './util.js';
const sourceShader = /* wgsl */`
struct Params { rect:vec4f, frame:vec4f, crop:vec4f, fx:vec4f, key:vec4f, misc:vec4f };
@group(0) @binding(0) var tex:texture_2d<f32>;
@group(0) @binding(1) var smp:sampler;
@group(0) @binding(2) var<uniform> p:Params;
struct Vertex { @builtin(position) position:vec4f, @location(0) uv:vec2f };
@vertex fn vs(@builtin(vertex_index) index:u32)->Vertex {
  let coords=array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
  let uv=mix(p.crop.xy,vec2f(1)-p.crop.zw,coords[index]);
  let local=(uv-vec2f(.5))*p.rect.zw;
  let s=sin(p.frame.z);let c=cos(p.frame.z);
  let pos=vec2f(c*local.x-s*local.y,s*local.x+c*local.y)+p.rect.xy;
  var o:Vertex;o.position=vec4f(pos.x/p.frame.x*2-1,1-pos.y/p.frame.y*2,0,1);o.uv=uv;return o;
}
@fragment fn fs(v:Vertex)->@location(0) vec4f {
  var col=textureSample(tex,smp,v.uv);
  if(p.misc.z>.01){let d=vec2f(p.misc.z)/vec2f(textureDimensions(tex));
    col=col*.25;
    col+=textureSample(tex,smp,v.uv+vec2f(d.x,0))*.125;
    col+=textureSample(tex,smp,v.uv-vec2f(d.x,0))*.125;
    col+=textureSample(tex,smp,v.uv+vec2f(0,d.y))*.125;
    col+=textureSample(tex,smp,v.uv-vec2f(0,d.y))*.125;
    col+=textureSample(tex,smp,v.uv+d)*.0625;
    col+=textureSample(tex,smp,v.uv-d)*.0625;
    col+=textureSample(tex,smp,v.uv+vec2f(d.x,-d.y))*.0625;
    col+=textureSample(tex,smp,v.uv+vec2f(-d.x,d.y))*.0625;
  }
  var alpha=col.a;var rgb=col.rgb;
  if(p.key.w>.5){let distance=length(rgb-p.key.xyz)/1.7320508;
    let mask=smoothstep(p.fx.w,p.fx.w+max(.001,p.misc.x),distance);
    alpha*=mask;
    let gray=min(min(rgb.r,rgb.g),rgb.b);
    rgb=mix(rgb,vec3f(gray),(1-mask)*p.misc.y);
  }
  rgb=(rgb*p.fx.x-vec3f(.5))*p.fx.y+vec3f(.5);
  let luma=dot(rgb,vec3f(.2126,.7152,.0722));rgb=mix(vec3f(luma),rgb,p.fx.z);
  alpha*=p.frame.w;return vec4f(clamp(rgb,vec3f(0),vec3f(1))*alpha,alpha);
}`;
const transitionShader=/* wgsl */`
@group(0) @binding(0) var a:texture_2d<f32>;
@group(0) @binding(1) var b:texture_2d<f32>;
@group(0) @binding(2) var smp:sampler;
@group(0) @binding(3) var<uniform> p:vec4f;
struct Vertex { @builtin(position) position:vec4f, @location(0) uv:vec2f };
@vertex fn vs(@builtin(vertex_index) i:u32)->Vertex {let coords=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var v:Vertex;v.position=vec4f(coords[i],0,1);v.uv=vec2f((coords[i].x+1)*.5,(1-coords[i].y)*.5);return v;}
@fragment fn fs(v:Vertex)->@location(0) vec4f {let old=textureSample(a,smp,v.uv);let next=textureSample(b,smp,v.uv);var amount=p.x;
  if(p.y>0.5&&p.y<1.5){amount=1-smoothstep(p.x-.003,p.x+.003,v.uv.x);}
  if(p.y>1.5){if(p.x<.5){return vec4f(old.rgb*(1-p.x*2),1);}return vec4f(next.rgb*(p.x*2-1),1);}
  return mix(old,next,amount);
}`;
export class GPURenderer {
  static async create(preview,program,onError){if(!navigator.gpu)throw new Error('WebGPU is not available');const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new Error('No WebGPU adapter');const device=await adapter.requestDevice();const r=new GPURenderer(device,preview,program,onError);try{await r.init();return r;}catch(e){r.dispose();throw e;}}
  constructor(device,preview,program,onError){this.device=device;this.preview=preview;this.program=program;this.onError=onError;this.format=navigator.gpu.getPreferredCanvasFormat();this.textures=new Map();this.uniforms=new Map();this.frame=0;this.kind='WebGPU';this.isDisposed=false;}
  async init(){const d=this.device;this.pc=this.preview.getContext('webgpu');this.oc=this.program.getContext('webgpu');if(!this.pc||!this.oc)throw new Error('Cannot configure WebGPU canvas');
    this.sampler=d.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
    d.pushErrorScope('validation');const module=d.createShaderModule({label:'SignalForge crop / color / chroma / blur',code:sourceShader});
    this.pipeline=await d.createRenderPipelineAsync({label:'Premultiplied source composition',layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:'rgba8unorm',blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
    const trans=d.createShaderModule({label:'Program transitions',code:transitionShader});
    this.finalPipeline=await d.createRenderPipelineAsync({layout:'auto',vertex:{module:trans,entryPoint:'vs'},fragment:{module:trans,entryPoint:'fs',targets:[{format:this.format}]},primitive:{topology:'triangle-list'}});
    const err=await d.popErrorScope();if(err)throw new Error(err.message);
    this.transitionBuffer=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.previewBuffer=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});d.queue.writeBuffer(this.previewBuffer,0,new Float32Array([0,0,0,0]));
    d.addEventListener('uncapturederror',event=>this.onError(event.error.message));d.lost.then(info=>{if(!this.isDisposed)this.onError('WebGPU device lost: '+info.message);});
  }
  resize(w,h){if(this.width===w&&this.height===h)return;this.width=w;this.height=h;for(const c of [this.preview,this.program]){c.width=w;c.height=h;}for(const ctx of [this.pc,this.oc])ctx.configure({device:this.device,format:this.format,alphaMode:'opaque',usage:GPUTextureUsage.RENDER_ATTACHMENT});
    for(const t of [this.a,this.b,this.p])t?.destroy();const make=label=>this.device.createTexture({label,size:[w,h],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});this.a=make('Program A');this.b=make('Program B');this.p=make('Preview');
    const group=(a,b,buffer)=>this.device.createBindGroup({layout:this.finalPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:a.createView()},{binding:1,resource:b.createView()},{binding:2,resource:this.sampler},{binding:3,resource:{buffer}}]});
    this.outputGroup=group(this.a,this.b,this.transitionBuffer);this.previewGroup=group(this.p,this.p,this.previewBuffer);
  }
  texture(visual){let t=this.textures.get(visual.key);const d=this.device;const max=d.limits.maxTextureDimension2D;
    if(visual.width>max||visual.height>max)throw new Error('Source exceeds GPU texture size limit. Resize the asset before importing.');
    if(!t||t.w!==visual.width||t.h!==visual.height){t?.texture.destroy();t={texture:d.createTexture({size:[visual.width,visual.height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT}),w:visual.width,h:visual.height,serial:null};t.view=t.texture.createView();this.textures.set(visual.key,t);}
    t.lastSeen=this.frame;if(t.serial!==visual.serial){d.queue.copyExternalImageToTexture({source:visual.element,flipY:false},{texture:t.texture,premultipliedAlpha:false,colorSpace:'srgb'},[visual.width,visual.height]);t.serial=visual.serial;}return t;
  }
  drawScene(encoder,target,snapshot,registry,time,bus){const pass=encoder.beginRenderPass({colorAttachments:[{view:target.createView(),clearValue:{r:.008,g:.008,b:.013,a:1},loadOp:'clear',storeOp:'store'}]});pass.setPipeline(this.pipeline);
    for(const item of snapshot.scene.items){if(!item.visible||item.opacity<=0)continue;const source=snapshot.sources[item.sourceId];if(!source)continue;const visual=registry.visual(source,item,time);if(!visual?.width||!visual?.height)continue;
      // Cull using conservative rotated bounds; cropped bounds need not be exact.
      const radius=Math.hypot(item.width,item.height)/2,cx=item.x+item.width/2,cy=item.y+item.height/2;if(cx+radius<0||cy+radius<0||cx-radius>1920||cy-radius>1080)continue;
      const tex=this.texture(visual);const key=bus+':'+item.id;let u=this.uniforms.get(key);if(!u){u={buffer:this.device.createBuffer({size:96,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),data:new Float32Array(24)};this.uniforms.set(key,u);}u.lastSeen=this.frame;
      const f=item.filters,c=item.crop,rgb=colorRGB(f.keyColor);u.data.set([cx,cy,item.width,item.height,1920,1080,item.rotation*Math.PI/180,item.opacity,c.l,c.t,c.r,c.b,f.brightness,f.contrast,f.saturation,f.threshold,...rgb,f.keyEnabled?1:0,f.softness,f.spill,f.blur,0]);this.device.queue.writeBuffer(u.buffer,0,u.data);
      if(u.texture!==tex){u.texture=tex;u.group=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:tex.view},{binding:1,resource:this.sampler},{binding:2,resource:{buffer:u.buffer}}]});}
      pass.setBindGroup(0,u.group);pass.draw(6);
    }pass.end();
  }
  blit(encoder,context,group){const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}]});pass.setPipeline(this.finalPipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();}
  render(preview,from,to,progress,mode,registry,time){this.frame++;const encoder=this.device.createCommandEncoder();this.drawScene(encoder,this.p,preview,registry,time,'preview');this.drawScene(encoder,this.a,from,registry,time,'from');if(to)this.drawScene(encoder,this.b,to,registry,time,'to');
    this.device.queue.writeBuffer(this.transitionBuffer,0,new Float32Array([to?progress:0,mode==='wipe'?1:mode==='dip'?2:0,0,0]));this.blit(encoder,this.pc,this.previewGroup);this.blit(encoder,this.oc,this.outputGroup);this.device.queue.submit([encoder.finish()]);
    if(this.frame%120===0){for(const [key,t]of this.textures)if(this.frame-t.lastSeen>180){t.texture.destroy();this.textures.delete(key);}for(const [key,u]of this.uniforms)if(this.frame-u.lastSeen>180){u.buffer.destroy();this.uniforms.delete(key);}}
  }
  dispose(){this.isDisposed=true;for(const t of this.textures.values())t.texture.destroy();for(const u of this.uniforms.values())u.buffer.destroy();for(const t of [this.a,this.b,this.p])t?.destroy();this.transitionBuffer?.destroy();this.previewBuffer?.destroy();this.pc?.unconfigure();this.oc?.unconfigure();this.device.destroy();}
}
