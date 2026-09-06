import {uid,clone,clamp,assert} from './util.js';
export const WIDTH=1920,HEIGHT=1080;
export function makeSource(type,name,config={}) {
  return {id:uid(),type,name,config,audio:{db:0,muted:false,pan:0,delay:0,highpass:20,gate:-65,gateEnabled:false,global:false}};
}
export function makeItem(sourceId, props={}) {
  return {id:uid(),sourceId,x:0,y:0,width:WIDTH,height:HEIGHT,rotation:0,opacity:1,visible:true,locked:false,crop:{l:0,t:0,r:0,b:0},filters:{brightness:1,contrast:1,saturation:1,blur:0,keyEnabled:false,keyColor:'#00ff00',threshold:.3,softness:.12,spill:.5},...props};
}
export function defaultProject() {
  const sources={},scenes=[];
  const source=(type,name,config)=>{const s=makeSource(type,name,config);sources[s.id]=s;return s;};
  const bg=source('generator','Aurora · motion background',{preset:'aurora',color:'#8b70f5'});
  const brand=source('text','Show identity',{text:'THE CREATIVE SIGNAL',fontSize:29,color:'#c7baff',weight:600,tracking:5,align:'left'});
  const headline=source('text','Opening headline',{text:'Ideas worth\ngoing live for.',fontSize:112,color:'#f6f4ff',weight:650,tracking:-3,align:'left'});
  const subtitle=source('text','Show subtitle',{text:'A space for the people building what’s next.',fontSize:29,color:'#b5b0c9',weight:400,tracking:0,align:'left'});
  const lower=source('lowerthird','Lower third · host',{title:'Alex Morgan',subtitle:'DESIGNER  /  MAKER  /  HOST',color:'#ac92ff'});
  const bug=source('badge','On-air identity',{text:'SIGNAL / 001',color:'#b8a4ff'});
  scenes.push({id:uid(),name:'Main stage',items:[makeItem(bg.id),makeItem(brand.id,{x:132,y:228,width:940,height:70}),makeItem(headline.id,{x:122,y:317,width:1100,height:310}),makeItem(subtitle.id,{x:132,y:653,width:1110,height:70}),makeItem(lower.id,{x:132,y:844,width:780,height:126}),makeItem(bug.id,{x:1450,y:62,width:355,height:74})]});
  const start=source('text','Starting soon',{text:'We’re almost live.',fontSize:116,color:'#f6f4ff',weight:650,tracking:-3,align:'center'});
  const count=source('countdown','Countdown',{seconds:300,color:'#b9a3ff',fontSize:158});
  scenes.push({id:uid(),name:'Starting soon',items:[makeItem(bg.id),makeItem(start.id,{x:110,y:260,width:1700,height:170}),makeItem(count.id,{x:410,y:457,width:1100,height:225}),makeItem(bug.id,{x:1450,y:62,width:355,height:74})]});
  const share=source('text','Screen share title',{text:'Your next big idea.\nOn the big screen.',fontSize:98,color:'#f6f4ff',weight:600,tracking:-2,align:'left'});
  scenes.push({id:uid(),name:'Screen share',items:[makeItem(bg.id),makeItem(share.id,{x:140,y:295,width:1400,height:310}),makeItem(lower.id,{x:132,y:844,width:780,height:126})]});
  const br=source('text','Intermission title',{text:'Good things take\na little pause.',fontSize:108,color:'#f6f4ff',weight:650,tracking:-3,align:'left'});
  scenes.push({id:uid(),name:'Intermission',items:[makeItem(bg.id),makeItem(br.id,{x:140,y:295,width:1550,height:340}),makeItem(bug.id,{x:1450,y:62,width:355,height:74})]});
  const end=source('text','Closing title',{text:'That’s a wrap.\nStay curious.',fontSize:112,color:'#f6f4ff',weight:650,tracking:-3,align:'left'});
  scenes.push({id:uid(),name:'End card',items:[makeItem(bg.id),makeItem(end.id,{x:140,y:295,width:1500,height:330}),makeItem(bug.id,{x:1450,y:62,width:355,height:74})]});
  return {version:1,name:'The Creative Signal',sources,scenes,preview:scenes[0].id,program:scenes[0].id,settings:{width:WIDTH,height:HEIGHT,fps:30,videoBitrate:8000000,audioBitrate:160000,codec:'auto',transition:'fade',transitionMs:650,masterDb:0,monitor:false,studio:true,snap:true,directToDisk:false,relayURL:'',hotkeys:{transition:'Space',record:'Ctrl+Shift+R',stream:'Ctrl+Shift+S',fit:'KeyF'}}};
}
const types=new Set(['generator','text','lowerthird','badge','countdown','color','image','video','audio','camera','screen','microphone','tone']);
const finite=(v,fallback,lo,hi)=>clamp(Number.isFinite(Number(v))?Number(v):fallback,lo,hi);
export function validateProject(raw) {
  assert(raw&&raw.version===1,'Unsupported project version.');
  assert(Array.isArray(raw.scenes)&&raw.scenes.length>0&&raw.scenes.length<=100,'A project needs 1–100 scenes.');
  assert(raw.sources&&typeof raw.sources==='object'&&Object.keys(raw.sources).length<=500,'Invalid source database.');
  const p=clone(raw), seen=new Set();
  const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
  for (const [id,s] of Object.entries(p.sources)) {
    assert(validId(id)&&s.id===id&&types.has(s.type),'Invalid source type or identity.');
    s.name=String(s.name||s.type).slice(0,120);s.config=s.config&&typeof s.config==='object'?s.config:{};
    delete s.config.url; // External URLs are not accepted: local persisted files only.
    s.audio={...makeSource('audio','').audio,...s.audio};
    s.audio.db=finite(s.audio.db,0,-60,12);s.audio.pan=finite(s.audio.pan,0,-1,1);s.audio.delay=finite(s.audio.delay,0,0,2000);s.audio.highpass=finite(s.audio.highpass,20,20,1000);s.audio.gate=finite(s.audio.gate,-65,-90,0);
  }
  for (const scene of p.scenes) {
    assert(validId(scene.id)&&!seen.has(scene.id),'Duplicate or invalid scene identity.');seen.add(scene.id);
    scene.name=String(scene.name||'Scene').slice(0,120);
    assert(Array.isArray(scene.items)&&scene.items.length<=200,'Too many scene items.');
    for(const item of scene.items) {
      assert(validId(item.id)&&!seen.has(item.id)&&Object.hasOwn(p.sources,item.sourceId),'Invalid scene item reference.');seen.add(item.id);
      for(const key of ['x','y']) item[key]=finite(item[key],0,-30000,30000);
      for(const key of ['width','height']) item[key]=finite(item[key],100,1,30000);
      item.rotation=finite(item.rotation,0,-36000,36000);item.opacity=finite(item.opacity,1,0,1);
      item.visible=item.visible!==false;item.locked=!!item.locked;
      item.crop={...makeItem('').crop,...item.crop};for(const k of ['l','t','r','b']) item.crop[k]=finite(item.crop[k],0,0,.95);
      if(item.crop.l+item.crop.r>.98)item.crop.r=.98-item.crop.l;
      if(item.crop.t+item.crop.b>.98)item.crop.b=.98-item.crop.t;
      item.filters={...makeItem('').filters,...item.filters};
      for(const k of ['brightness','contrast','saturation'])item.filters[k]=finite(item.filters[k],1,0,3);
      item.filters.blur=finite(item.filters.blur,0,0,20);
      for(const [k,d]of [['threshold',.3],['softness',.12],['spill',.5]])item.filters[k]=finite(item.filters[k],d,0,1);
      if(!/^#[a-f\d]{6}$/i.test(item.filters.keyColor))item.filters.keyColor='#00ff00';
    }
  }
  p.name=String(p.name||'Untitled production').slice(0,120);
  if(!p.scenes.some(s=>s.id===p.preview))p.preview=p.scenes[0].id;
  if(!p.scenes.some(s=>s.id===p.program))p.program=p.scenes[0].id;
  p.settings={...defaultProject().settings,...p.settings};
  assert([[1920,1080],[1280,720],[854,480]].some(([w,h])=>w===p.settings.width&&h===p.settings.height),'Unsupported output dimensions.');
  p.settings.fps=[24,25,30,50,60].includes(p.settings.fps)?p.settings.fps:30;
  p.settings.videoBitrate=finite(p.settings.videoBitrate,8000000,500000,30000000);
  p.settings.audioBitrate=finite(p.settings.audioBitrate,160000,64000,320000);
  p.settings.transitionMs=finite(p.settings.transitionMs,650,0,5000);
  p.settings.masterDb=finite(p.settings.masterDb,0,-60,6);
  if(!['cut','fade','wipe','dip'].includes(p.settings.transition))p.settings.transition='fade';
  return p;
}
export class Store extends EventTarget {
  constructor(project=defaultProject()){super();this.project=validateProject(project);this.undoStack=[];this.redoStack=[];this.transaction=null;this.revision=0;}
  emit(label='Update'){this.revision++;this.dispatchEvent(new CustomEvent('change',{detail:{label,revision:this.revision}}));}
  begin(label){if(!this.transaction)this.transaction={label,before:clone(this.project)};}
  commit(){if(!this.transaction)return;const t=this.transaction;this.transaction=null;if(JSON.stringify(t.before)!==JSON.stringify(this.project)){this.undoStack.push(t);if(this.undoStack.length>60)this.undoStack.shift();this.redoStack=[];this.emit(t.label);}}
  cancel(){if(!this.transaction)return;this.project=this.transaction.before;this.transaction=null;this.emit('Cancel');}
  mutate(label,fn){this.begin(label);try{fn(this.project);this.commit();}catch(e){this.cancel();throw e;}}
  undo(){if(this.transaction)this.commit();const t=this.undoStack.pop();if(t){this.redoStack.push({label:t.label,before:clone(this.project)});this.project=t.before;this.emit(`Undo ${t.label}`);}}
  redo(){const t=this.redoStack.pop();if(t){this.undoStack.push({label:t.label,before:clone(this.project)});this.project=t.before;this.emit(`Redo ${t.label}`);}}
  replace(project){this.project=validateProject(project);this.undoStack=[];this.redoStack=[];this.emit('Load project');}
  scene(id=this.project.preview){return this.project.scenes.find(s=>s.id===id);}
}
