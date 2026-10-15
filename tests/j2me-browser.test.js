// Optional real-browser test: J2ME_TEST_CHROME=/path/to/chrome node --test tests/j2me-browser.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { smokeJar } from './fixtures/j2me/smokeJar.js'

const chromePath=process.env.J2ME_TEST_CHROME
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const page=`<!doctype html><meta charset="utf-8"><script type="module">
import {prepareJ2me} from '/src/composables/player/j2meRuntime.js';
window.result={stage:'starting'};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function check(value,message){if(!value)throw Error(message)}
// J2ME 的“核心”进度：记录运行时预取写进面板的东西，以及父页面自己发出的请求。
const coreTasks=[],coreEvents=[],parentFetches=[];
const fakeProgress={tasks:coreTasks,sessionId:1,ensureTask:t=>coreTasks.push(t),dropTask:()=>{},setStage:()=>{},taskProgress:(id,loaded)=>coreEvents.push(['progress',id,loaded]),taskSettled:(id,status)=>coreEvents.push(['settled',id,status]),taskFailed:(id,message)=>coreEvents.push(['failed',id,message]),currentSignal:()=>null};
const realFetch=window.fetch.bind(window);
window.fetch=(...args)=>{parentFetches.push(String(args[0]));return realFetch(...args)};
async function pixel(emu,expected){for(let i=0;i<100;i++){const p=[...emu.getCanvas().getContext('2d').getImageData(1,1,1,1).data];if(JSON.stringify(p)===JSON.stringify(expected))return p;await delay(50)}throw Error('Pixel did not become '+expected)}
try {
  const options={rom:{fileName:'smoke.jar',fileContent:'/smoke.jar'},timeoutMs:12000,retroarchConfig:{input_player1_l2:'j'},progress:fakeProgress};
  const emu=await prepareJ2me(options);document.body.append(emu.getCanvas());await emu.start();
  // 运行时脚本与类库必须在下 iframe 之前按带版本号的地址取一遍，进度写进面板。
  const runtimeTask=coreTasks.find(t=>t.id==='core:j2mejs:runtime');
  check(runtimeTask&&runtimeTask.size>0,'the runtime task must be registered with its size');
  check(coreEvents.some(e=>e[0]==='settled'&&e[1]==='core:j2mejs:runtime'&&e[2]==='done'),'the runtime task must settle as done');
  check(coreEvents.some(e=>e[0]==='progress'&&e[1]==='core:j2mejs:java:classesold.jar'&&e[2]>0),'the class library must report bytes');
  check(parentFetches.includes('/j2me/preload.js?v=testversion'),'the player must prefetch runtime files under the build version: '+parentFetches.join(','));
  const evidence={initial:await pixel(emu,[0,0,255,255]),coreTasks,coreEvents,parentFetches};
  check(document.querySelector('iframe').contentDocument!==null,'hosted runtime must be same-origin so it keeps its IndexedDB state');
  emu.pressDown({button:'l2',player:2});await delay(200);check(emu.getCanvas().getContext('2d').getImageData(1,1,1,1).data[2]===255,'P2 input must be ignored');
  emu.pressDown({button:'l2'});evidence.pressed=await pixel(emu,[0,255,0,255]);
  emu.pressUp({button:'l2'});evidence.released=await pixel(emu,[255,0,0,255]);
  await emu.pause();check(emu.getStatus().state==='paused','pause state');emu.pressDown({button:'l2'});await delay(500);evidence.paused=await pixel(emu,[255,0,0,255]);
  await emu.resume();emu.getCanvas().dispatchEvent(new KeyboardEvent('keydown',{key:'j',bubbles:true}));evidence.keyboard=await pixel(emu,[0,255,0,255]);
  for(const method of ['saveState','loadState']){let rejected=false;try{await emu[method]()}catch(e){rejected=/不支持/.test(e.message)}check(rejected,method+' must reject')}
  await emu.exit();await emu.exit();check(!document.querySelector('iframe'),'exit must remove iframe');
  const cancel=await prepareJ2me(options);const starting=cancel.start();await cancel.exit();let cancelled=false;try{await starting}catch{cancelled=true}check(cancelled,'exit must reject pending start');
  let missingMainError=null;let bad=null;try{bad=await prepareJ2me({...options,rom:{fileName:'missing.jar',fileContent:'/missing-main.jar'}})}catch(e){missingMainError=e.message}
  if(bad){try{await bad.start()}catch(e){missingMainError=missingMainError||e.message}check(missingMainError,'missing main class must fail');check(bad.getStatus().state==='failed','failed status');check(!document.querySelector('iframe'),'failed boot must dispose iframe');await bad.exit()}
  else check(/主类|MIDlet-1/.test(missingMainError),'missing main class must be reported: '+missingMainError);
  const again=await prepareJ2me(options);await again.start();evidence.restarted=await pixel(again,[0,0,255,255]);await again.exit();
  const animated=await prepareJ2me({...options,rom:{fileName:'animated.jar',fileContent:'/animated.jar'}});await animated.start();
  const blue=()=>animated.getCanvas().getContext('2d').getImageData(1,1,1,1).data[2];const first=blue();await delay(1200);check(blue()>first,'Java Thread.sleep loop must animate');
  await animated.pause();const frozen=blue();await delay(1200);check(blue()===frozen,'pause must freeze animation');await animated.resume();
  let firstResumed=frozen;for(let i=0;i<80&&firstResumed===frozen;i++){await delay(25);firstResumed=blue()}
  check(firstResumed>frozen&&firstResumed-frozen<=3,'VM timer must suspend, not advance unseen');evidence.animation={frozen,firstResumed};await animated.exit();
  const repaint=await prepareJ2me({...options,rom:{fileName:'repaint.jar',fileContent:'/repaint.jar'}});await repaint.start();evidence.serviceRepaints=await pixel(repaint,[0,0,255,255]);await repaint.exit();
  // 运行时页面必须带构建版本号，否则手机浏览器 12 小时静态缓存会让新页面配上旧脚本。
  const versioned=await prepareJ2me(options);await versioned.start();evidence.frameVersion=(document.querySelector('iframe').src.match(/[?&]v=([^&]*)/)||[])[1];await versioned.exit();
  // 启动期间报出来的错误（WebKit 会抛上游代码在 V8 上忽略的 Promise 拒绝）先给一段宽限期：
  // 画得出来就继续跑，画不出来再带着原始错误信息失败，而不是干等超时。
  const graceful=await prepareJ2me(options);const gracefulStart=graceful.start();
  window.postMessage({type:'j2me-error',message:'survivable-boom'},'*');
  await gracefulStart;await delay(600);check(graceful.getStatus().state==='running','a survivable runtime error must not kill a booting session');evidence.survivableError=graceful.getStatus().state;await graceful.exit();
  let graceFailure=null,graceMs=0;const graceStart=performance.now();
  try{const broken=await prepareJ2me({...options,runtimeUrl:'/blank.html',timeoutMs:20000});const pending=broken.start();window.postMessage({type:'j2me-error',message:'fatal-boom'},'*');await pending}
  catch(error){graceFailure=error.message;graceMs=Math.round(performance.now()-graceStart)}
  check(/fatal-boom/.test(graceFailure||''),'a boot that never paints must fail with the runtime error: '+graceFailure);
  check(graceMs>1000&&graceMs<15000,'the boot error grace period must be used, not bypassed: '+graceMs);
  evidence.bootErrorGrace={graceFailure,graceMs};
  // Keep one VM alive so the driver can measure the runtime frame's timer
  // latency before the page reports completion.
  window.held=await prepareJ2me(options);await window.held.start();
  window.release=async()=>{await window.held.exit();result={stage:'done',evidence,missingMainError}};
  window.holdFrameReady=true;
} catch(e){result={stage:'failed',error:e.stack}};
</script>`

test('real Chromium executes MIDlet bytecode, handles input and cleans up failures', {skip:!chromePath,timeout:60000}, async()=>{
  const root=fileURLToPath(new URL('../frontend/',import.meta.url))
  const server=createServer(async(req,res)=>{try{
    const pathname=new URL(req.url,'http://localhost').pathname
    if(pathname==='/'){res.setHeader('content-type','text/html');res.end(page);return}
    if(pathname==='/blank.html'){res.setHeader('content-type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>blank</title>');return}
    if(pathname==='/j2me/version.json'){res.setHeader('content-type','application/json');res.end(JSON.stringify({version:'testversion',boot:[{name:'main.html',size:6826},{name:'preload.js',size:587},{name:'bridge.js',size:3950},{name:'config/build.js',size:98},{name:'java/classesold.jar',size:1682052}]}));return}
    if(['/smoke.jar','/missing-main.jar','/animated.jar','/repaint.jar'].includes(pathname)){res.end(smokeJar({missingMain:pathname.includes('missing'),animated:pathname.includes('animated'),serviceRepaints:pathname.includes('repaint')}));return}
    const file=path.resolve(root,pathname.startsWith('/j2me/')?'public'+pathname:'.'+pathname)
    if(!file.startsWith(root))throw Error('invalid path')
    res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream')
    res.end(await readFile(file))
  }catch{res.statusCode=404;res.end('Not found')}})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const origin='http://127.0.0.1:'+server.address().port
  const debugPort=Number(process.env.J2ME_TEST_DEBUG_PORT||9337)
  const chrome=spawn(chromePath,['--headless=new','--no-sandbox','--disable-dev-shm-usage', '--remote-debugging-port='+debugPort,'about:blank'],{stdio:'ignore'})
  let ws
  try {
    let target
    for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json()).find(t=>t.type==='page'&&t.url==='about:blank');if(target)break}catch{}await delay(100)}
    assert.ok(target,'Chromium debugging endpoint not available')
    ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}))
    let id=0;const pending=new Map(),requests=[]
    ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id)}if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url)}
    const send=(method,params={})=>new Promise(resolve=>{const n=++id;pending.set(n,resolve);ws.send(JSON.stringify({id:n,method,params}))})
    await send('Runtime.enable');await send('Network.enable');await send('Page.navigate',{url:origin})
    let result
    for(let i=0;i<450;i++){
      await delay(100)
      const r=await send('Runtime.evaluate',{expression:'JSON.stringify(window.result)',returnByValue:true})
      if(r.result?.result?.value)result=JSON.parse(r.result.result.value)
      if(['done','failed'].includes(result?.stage))break
      const held=await send('Runtime.evaluate',{expression:'window.holdFrameReady===true',returnByValue:true})
      if(held.result?.result?.value)break
    }
    if(result?.stage==='failed')assert.equal(result.stage,'done',JSON.stringify(result))
    // Chrome throttles timers in frames it considers invisible (hidden,
    // off-screen or 0-sized), which stalls the VM, so the runtime frame has to
    // stay on-screen. Measuring the frame's own timer latency from the page is
    // the regression guard for that failure mode.
    const probe=await send('Runtime.evaluate',{expression:`(async()=>{const win=document.querySelector('iframe')&&document.querySelector('iframe').contentWindow;if(!win)return JSON.stringify({error:'no frame'});const samples=[];const start=performance.now();let ticks=0;while(performance.now()-start<1000){const tick=performance.now();await new Promise(resolve=>win.setTimeout(resolve,0));samples.push(performance.now()-tick);ticks++}samples.sort((a,b)=>a-b);const rect=document.querySelector('iframe').getBoundingClientRect();return JSON.stringify({ticks,median:Math.round(samples[Math.floor(samples.length/2)]),max:Math.round(samples[samples.length-1]),w:Math.round(rect.width),h:Math.round(rect.height)})})()`,returnByValue:true,awaitPromise:true})
    const timers=JSON.parse(probe.result.result.value)
    assert.ok(timers.ticks>=50,'runtime frame timers must not be throttled: '+JSON.stringify(timers))
    assert.ok(timers.w>0&&timers.h>0,'runtime frame must stay on-screen so Chrome does not throttle it: '+JSON.stringify(timers))
    await send('Runtime.evaluate',{expression:'release()'})
    for(let i=0;i<150;i++){
      await delay(100)
      const r=await send('Runtime.evaluate',{expression:'JSON.stringify(window.result)',returnByValue:true})
      if(r.result?.result?.value)result=JSON.parse(r.result.result.value)
      if(['done','failed'].includes(result?.stage))break
    }
    assert.equal(result?.stage,'done',JSON.stringify(result))
    assert.deepEqual(result.evidence.initial,[0,0,255,255]);assert.deepEqual(result.evidence.pressed,[0,255,0,255]);assert.deepEqual(result.evidence.released,[255,0,0,255])
    assert.equal(result.evidence.frameVersion,'testversion','the runtime frame must carry the build version')
    // J2ME 的“核心”进度：运行时脚本与类库在 iframe 之前先取一遍，地址带同一个版本号。
    assert.ok(result.evidence.coreTasks.some(task=>task.id==='core:j2mejs:runtime'&&task.size>0),'runtime task registered with its size')
    assert.ok(result.evidence.coreEvents.some(event=>event[1]==='core:j2mejs:java:classesold.jar'&&event[2]>0),'class library progress reported')
    assert.ok(result.evidence.parentFetches.includes('/j2me/preload.js?v=testversion'),'runtime files prefetched under the build version')
    assert.equal(result.evidence.survivableError,'running')
    assert.match(result.evidence.bootErrorGrace.graceFailure,/fatal-boom/)
    assert.ok(result.evidence.bootErrorGrace.graceMs>1000&&result.evidence.bootErrorGrace.graceMs<15000)
    assert.ok(requests.filter(url=>/^https?:/.test(url)).every(url=>url.startsWith(origin+'/')),'No third-party runtime requests')
    console.log('J2ME browser evidence:',JSON.stringify({...result,timers}))
  } finally {ws?.close();chrome.kill('SIGTERM');await new Promise(resolve=>server.close(resolve))}
})
