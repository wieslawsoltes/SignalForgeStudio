"""End-to-end browser verification. Start `npm start` before running.
Install: python -m pip install playwright pillow; python -m playwright install chromium
Optional: CHROMIUM=/path/to/chromium SIGNALFORGE_URL=http://127.0.0.1:8787 python tests/browser_e2e.py
Fake camera/microphone devices are used deliberately; physical hardware is not accessed.
"""
import asyncio,base64,io,json,os,pathlib,shutil,subprocess,time
from PIL import Image
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
ART=ROOT/'tests'/'artifacts'/os.environ.get('TEST_ENGINE','webgpu');ART.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('SIGNALFORGE_URL','http://127.0.0.1:8787')+ ('/?canvas' if os.environ.get('TEST_ENGINE')=='canvas' else '/')
RESULTS=[]
async def wait(page,expression,timeout=15):
 start=time.monotonic()
 while time.monotonic()-start<timeout:
  if await page.evaluate(expression):return
  await page.wait_for_timeout(150)
 raise AssertionError('Timed out: '+expression)
def passed(name,detail=None):
 RESULTS.append({'name':name,'passed':True,**({'detail':detail} if detail else {})});print('PASS',name,detail or '',flush=True)
async def pixel(page,selector='#program-canvas',u=.6,v=.5):
 png=await page.locator(selector).screenshot();img=Image.open(io.BytesIO(png)).convert('RGB');return img.getpixel((int(img.width*u),int(img.height*v)))
async def main():
 async with async_playwright() as pw:
  executable=os.environ.get('CHROMIUM') or shutil.which('chromium')
  browser=await pw.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-gpu','--ignore-gpu-blocklist','--use-vulkan=swiftshader','--enable-features=Vulkan','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
  context=await browser.new_context(viewport={'width':1536,'height':960},accept_downloads=True)
  page=await context.new_page();errors=[];console_errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda m:console_errors.append(m.text) if m.type=='error' else None)
  await page.goto(URL,wait_until='networkidle');await wait(page,'!!window.signalforge?.ready',45)
  await page.evaluate("window.engineErrors=[];signalforge.engine.addEventListener('error',e=>engineErrors.push(e.detail))")
  kind=await page.evaluate('signalforge.engine.renderer.kind');passed('Application boot and compositor initialization',kind)
  await page.wait_for_timeout(1000)
  await page.evaluate("document.querySelector('#toasts').replaceChildren()")
  await page.screenshot(path=str(ART/'desktop.png'),full_page=True)
  # Verify scene selection and undo/redo through the real controls.
  original=await page.evaluate('signalforge.store.scene().items.length')
  await page.keyboard.press('Control+d')
  assert await page.evaluate('signalforge.store.scene().items.length')==original+1
  await page.keyboard.press('Control+z')
  assert await page.evaluate('signalforge.store.scene().items.length')==original
  passed('Keyboard duplicate and undo')
  await page.click('.production-tools [data-action="add-camera"]')
  await wait(page,"[...signalforge.media.entries.values()].some(e=>e.type==='camera'&&e.stream?.getVideoTracks().length)",20)
  await page.evaluate("window.testCamera=[...signalforge.media.entries.values()].find(e=>e.type==='camera').stream.getVideoTracks()[0]")
  passed('MediaStream camera capture with synthetic browser device')
  await page.click('[data-action="close-inspector"]')
  await page.click('.production-tools [data-action="add-microphone"]')
  await wait(page,"[...signalforge.media.entries.values()].some(e=>e.type==='microphone'&&e.stream?.getAudioTracks().length)",20)
  passed('Microphone capture and Web Audio channel creation')
  await page.click('[data-action="close-inspector"]')
  # A controlled project makes pixel tests deterministic and inexpensive.
  await page.evaluate('''async()=>{
   const {makeSource,makeItem}=await import('./core/store.js');
   const bg=makeSource('color','Blue',{color:'#0000ff'}),fg=makeSource('color','Green',{color:'#00ff00'}),red=makeSource('color','Red',{color:'#ff0000'});
   const bottom=makeItem(bg.id),top=makeItem(fg.id,{x:480,y:270,width:960,height:540});top.filters.keyEnabled=true;
   const a={id:crypto.randomUUID(),name:'Blue & keyed green',items:[bottom,top]},b={id:crypto.randomUUID(),name:'Red',items:[makeItem(red.id)]};
   const p=signalforge.store.project;p.sources={[bg.id]:bg,[fg.id]:fg,[red.id]:red};p.scenes=[a,b];p.preview=p.program=a.id;Object.assign(p.settings,{width:854,height:480,fps:30,videoBitrate:2000000,transitionMs:300});
   signalforge.engine.reload();signalforge.store.emit('Test project');signalforge.selectItem(top.id);
   window.testTop=top.id;window.testBlue=a.id;window.testRed=b.id;
  }''')
  await page.wait_for_timeout(650)
  assert await page.evaluate("testCamera.readyState==='ended'")
  passed('Unreferenced capture tracks are stopped')
  color=await pixel(page)
  assert color[2]>235 and color[1]<20,(kind,color)
  passed('Chroma-key compositing removes green and reveals blue',str(color))
  await page.evaluate("signalforge.store.mutate('Key off',()=>signalforge.selectedItem().filters.keyEnabled=false)")
  await page.wait_for_timeout(350)
  preview=await pixel(page,'#preview-canvas');program=await pixel(page)
  assert preview[1]>235 and program[2]>235,(preview,program)
  passed('Preview filter edits do not alter live program pixels')
  await page.evaluate("signalforge.engine.take('cut')")
  await page.wait_for_timeout(300)
  color=await pixel(page);assert color[1]>235 and color[2]<20,color
  passed('Cut publishes the edited scene snapshot')
  # Opacity and crop operate on actual output pixels.
  await page.evaluate("signalforge.store.mutate('Opacity',()=>signalforge.selectedItem().opacity=.5);signalforge.engine.take('cut')")
  await page.wait_for_timeout(300);color=await pixel(page)
  assert abs(color[1]-128)<10 and abs(color[2]-128)<10,color
  passed('Premultiplied alpha composition',str(color))
  await page.evaluate("signalforge.store.mutate('Crop',()=>{const i=signalforge.selectedItem();i.opacity=1;i.crop.l=.5;});signalforge.engine.take('cut')")
  await page.wait_for_timeout(300);left=await pixel(page,u=.4);right=await pixel(page,u=.6)
  assert left[2]>235 and right[1]>235,(left,right)
  passed('Crop removes source pixels without stretching')
  # Actual pointer drag with transaction-based undo.
  await page.evaluate("signalforge.store.mutate('Crop reset',()=>signalforge.selectedItem().crop.l=0)")
  before=await page.evaluate('signalforge.selectedItem().x')
  box=await page.locator('#selection-overlay').bounding_box()
  await page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.5)
  await page.mouse.down();await page.mouse.move(box['x']+box['width']*.58,box['y']+box['height']*.56,steps=5);await page.mouse.up()
  assert abs(await page.evaluate('signalforge.selectedItem().x')-before)>30
  await page.keyboard.press('Control+z');assert abs(await page.evaluate('signalforge.selectedItem().x')-before)<.001
  passed('Interactive source dragging and one-step undo')
  for transition in ['fade','wipe','dip']:
   await page.evaluate("signalforge.setPreview(testBlue);signalforge.engine.take('cut')")
   await page.evaluate(f"signalforge.setPreview(testRed);signalforge.engine.take('{transition}')")
   await wait(page,'signalforge.engine.transition===null')
   await page.wait_for_timeout(150);color=await pixel(page)
   assert color[0]>235 and color[1]<20,color
   passed('Scene transition: '+transition)
  # A real tone makes audio encoding and meter assertions measurable.
  await page.evaluate("signalforge.setPreview(testBlue);signalforge.engine.take('cut')")
  tone=await page.evaluate("async()=>{const s=await signalforge.addSource('tone');signalforge.store.mutate('Unmute test',()=>s.audio.muted=false);return s.id;}")
  await page.wait_for_timeout(500)
  level=await page.evaluate(f"signalforge.audio.meters().get('{tone}')?.rms")
  assert level is not None and -50<level<-10,level
  assert await page.evaluate('signalforge.audio.worklet')
  passed('AudioWorklet loaded and actual signal metered',f'{level:.2f} dB RMS')
  await page.click('#record-button');await wait(page,'!!signalforge.output.recording')
  await page.wait_for_timeout(1700);await page.click('#pause-button')
  assert await page.evaluate("signalforge.output.recording.recorder.state==='paused'")
  await page.wait_for_timeout(400);await page.click('#pause-button');await page.wait_for_timeout(1400)
  await page.click('#record-button');await wait(page,'signalforge.output.recording===null')
  meta=await page.evaluate('(async()=> (await signalforge.storage.recordings()).at(-1))()')
  assert meta['state']=='ready' and meta['bytes']>1000,meta
  passed('Recording, pause/resume and IndexedDB finalization',f"{meta['bytes']} bytes")
  async with page.expect_download() as event:
   await page.evaluate("async()=>{const rows=await signalforge.storage.recordings();await signalforge.output.exportRecording(rows.at(-1));}")
  saved=await event.value;await saved.save_as(str(ART/'recording.webm'))
  if shutil.which('ffprobe'):
   probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(ART/'recording.webm')]))
   streams=probe['streams'];assert any(s['codec_type']=='video' and s['width']==854 and s['height']==480 for s in streams),streams
   assert any(s['codec_type']=='audio' for s in streams),streams
   (ART/'recording-probe.json').write_text(json.dumps(probe,indent=2))
   passed('Export is a decodable 854×480 video with encoded audio',', '.join(s['codec_name'] for s in streams))
  # WebSocket transport and relay disk sink.
  before_files=set((ROOT/'recordings').glob('*'))
  await page.click('#stream-button');await wait(page,'!!signalforge.output.streaming',20)
  mode=await page.evaluate('signalforge.output.streaming.mode')
  await page.wait_for_timeout(3200)
  seq=await page.evaluate('signalforge.output.streaming.seq')
  await page.click('#stream-button');await wait(page,'signalforge.output.streaming===null',15)
  if mode=='archive':
   files=set((ROOT/'recordings').glob('*'))-before_files;assert len(files)==1,files
   archive=next(iter(files));assert archive.stat().st_size>1000
   shutil.copy2(archive,ART/'relay-archive.webm')
   if shutil.which('ffprobe'):
    info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(archive)]));assert len(info['streams'])==2
   passed('Authenticated sequenced WebSocket archive is decodable',f'{seq} chunks; {archive.stat().st_size} bytes')
  else:passed('RTMP relay session completed',f'{seq} browser chunks')
  # Portable assets and reload persistence.
  await page.evaluate('''async()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const g=c.getContext('2d');g.fillStyle='#ffdd22';g.fillRect(0,0,64,64);const b=await new Promise(r=>c.toBlob(r));await signalforge.addSource('image',new File([b],'test-image.png',{type:'image/png'}));}''')
  await wait(page,"[...signalforge.media.entries.values()].some(e=>e.type==='image'&&e.status==='Ready')")
  asset_count=await page.evaluate("(async()=>{const blob=await signalforge.storage.exportProject(signalforge.store.project);const p=JSON.parse(await blob.text());return Object.keys(p.assets).length})()")
  assert asset_count==1
  assert not await page.evaluate('engineErrors'),await page.evaluate('engineErrors')
  await page.wait_for_timeout(700);await page.reload(wait_until='networkidle');await wait(page,'!!window.signalforge?.ready')
  await wait(page,"[...signalforge.media.entries.values()].some(e=>e.type==='image'&&e.status==='Ready')")
  passed('Portable project embeds assets and local persistence restores images')
  assert not errors,errors
  assert not console_errors,console_errors
  passed('No uncaught JavaScript or GPU validation errors')
  await page.set_viewport_size({'width':390,'height':844});await page.wait_for_timeout(400)
  await page.screenshot(path=str(ART/'mobile.png'),full_page=True)
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  passed('Narrow viewport layout does not overflow horizontally')
  await browser.close()
 (ART/'browser-results.json').write_text(json.dumps({'engine':kind,'checks':RESULTS},indent=2))
asyncio.run(main())
