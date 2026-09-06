export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const uid = () => crypto.randomUUID();
export const clone = value => structuredClone(value);
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const dbToGain = db => db <= -60 ? 0 : Math.pow(10, db / 20);
export const gainToDb = gain => 20 * Math.log10(Math.max(1e-6, gain));
export const colorRGB = hex => /^#[a-f\d]{6}$/i.test(hex) ? [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255) : [0,1,0];
export function duration(seconds) { const n = Math.max(0, Math.floor(seconds)); return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':'); }
export const sizeLabel = bytes => bytes > 1048576 ? `${(bytes/1048576).toFixed(1)} MB` : `${(bytes/1024).toFixed(0)} KB`;
export function download(blob, name) { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),30000); }
export function listen(target, type, handler, options) { target.addEventListener(type,handler,options); return () => target.removeEventListener(type,handler,options); }
export function deferred() { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
export function assert(condition, message) { if (!condition) throw new Error(message); }
export function readFile(accept, multiple=false) { return new Promise(resolve=>{const el=document.createElement('input');el.type='file';el.accept=accept;el.multiple=multiple;el.onchange=()=>resolve([...el.files]);el.oncancel=()=>resolve([]);el.click();}); }
export function localPoint(item, px, py) { const a=-item.rotation*Math.PI/180, dx=px-item.x-item.width/2,dy=py-item.y-item.height/2; return {x:(dx*Math.cos(a)-dy*Math.sin(a))/item.width+.5,y:(dx*Math.sin(a)+dy*Math.cos(a))/item.height+.5}; }
export function corners(item) { const c=item.crop, a=item.rotation*Math.PI/180; return [[c.l,c.t],[1-c.r,c.t],[1-c.r,1-c.b],[c.l,1-c.b]].map(([u,v])=>{ const x=(u-.5)*item.width,y=(v-.5)*item.height;return {x:item.x+item.width/2+x*Math.cos(a)-y*Math.sin(a),y:item.y+item.height/2+x*Math.sin(a)+y*Math.cos(a)};}); }
export function hitItem(item,x,y) { const p=localPoint(item,x,y),c=item.crop;return p.x>=c.l&&p.x<=1-c.r&&p.y>=c.t&&p.y<=1-c.b; }
export function filename(prefix,extension) {return `${prefix}-${new Date().toISOString().replace(/[:.]/g,'-')}.${extension}`;}
