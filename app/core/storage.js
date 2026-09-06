import {uid,assert} from './util.js';
const request = r => new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export class Storage {
  async open(){this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('signalforge-studio',1);r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('assets');db.createObjectStore('recordings',{keyPath:'id'});db.createObjectStore('chunks',{keyPath:['id','seq']});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return this;}
  async tx(name,mode,fn){const t=this.db.transaction(name,mode);const done=new Promise((res,rej)=>{t.oncomplete=res;t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||new Error('Storage transaction aborted'));});const result=fn(t.objectStore(name));const value=result&&typeof result.onsuccess!=='undefined'?request(result):result;const [out]=await Promise.all([value,done]);return out;}
  async asset(file,id=uid()){await this.tx('assets','readwrite',s=>s.put(file,id));return id;}
  getAsset(id){return this.tx('assets','readonly',s=>s.get(id));}
  putRecording(meta){return this.tx('recordings','readwrite',s=>s.put(meta));}
  recordings(){return this.tx('recordings','readonly',s=>s.getAll());}
  append(id,seq,data){return this.tx('chunks','readwrite',s=>s.put({id,seq,data}));}
  async blob(id,type){const rows=await this.tx('chunks','readonly',s=>s.getAll(IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER])));return new Blob(rows.map(x=>x.data),{type});}
  async deleteRecording(id){await this.tx('recordings','readwrite',s=>s.delete(id));await this.tx('chunks','readwrite',s=>s.delete(IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER])));}
  async exportProject(project){const assets={};for(const s of Object.values(project.sources)){const id=s.config.assetId;if(!id||assets[id])continue;const file=await this.getAsset(id);if(file){const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(file);});assets[id]={name:file.name||'asset',type:file.type,data};}}return new Blob([JSON.stringify({...project,assets},null,2)],{type:'application/json'});}
  async importAssets(project){for(const [id,a]of Object.entries(project.assets||{})){assert(typeof a.data==='string'&&/^data:(image\/|video\/|audio\/|application\/octet-stream)/.test(a.data)&&a.data.includes(';base64,'),'Invalid embedded asset.');const blob=await(await fetch(a.data)).blob();assert(blob.size<256*1024*1024,'Embedded asset exceeds 256 MB.');await this.asset(new File([blob],String(a.name||'asset').slice(0,255),{type:blob.type}),id);}delete project.assets;}
  close(){this.db?.close();}
}
