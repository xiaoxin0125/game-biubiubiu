// Opt-in external-ROM probe, not an automatic test or bundled commercial ROM.
// J2ME_TEST_CHROME=/path/to/chrome node tests/j2me-real-game.mjs /path/game.jar /tmp/evidence
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {tmpdir} from 'node:os'
const chromePath=process.env.J2ME_TEST_CHROME
assert.ok(chromePath,'Set J2ME_TEST_CHROME to Chromium')
const romPath=process.argv[2]
assert.ok(romPath,'Pass a legally available external JAR path')
const out=path.resolve(process.argv[3]||'/tmp/j2me-real-evidence')
await mkdir(out,{recursive:true})
const bytes=await readFile(romPath)
const root=path.resolve(fileURLToPath(new URL('../frontend/',import.meta.url)))
const repo=path.dirname(root)
const entry=process.env.J2ME_TEST_ENTRY || 'adapter'
assert.ok(['adapter','player'].includes(entry),'J2ME_TEST_ENTRY must be adapter or player')
const httpPort=Number(process.env.J2ME_TEST_HTTP_PORT||4397)
const debugPort=Number(process.env.J2ME_TEST_DEBUG_PORT||9337)
const origin='http://127.0.0.1:'+httpPort
const playerEntry=entry==='player'
const page=`<!doctype html><meta charset="utf-8"><style>canvas{width:480px;height:640px;image-rendering:pixelated;background:#ddd}</style>
<div id="host"></div>
<script type="importmap">{"imports":{"vue":"/node_modules/vue/dist/vue.esm-browser.js","nostalgist":"/node_modules/nostalgist/dist/nostalgist.js"}}</script>
<script type="module">
${playerEntry ? `
import {useEmulator} from '/src/composables/useEmulator.js';
import {buildPlayerRetroarchConfig} from '/src/composables/input/retroarchConfig.js';
import {getPlatform} from '/src/constants/platforms.js';
window.player=useEmulator();player.wrapperRef.value=document.getElementById('host');
window.stop=()=>player.destroy();
window.key=(down)=>player[down?'pressButton':'releaseButton']('l2');
window.boot=async()=>{
 await stop();const begin=performance.now();
 window.emu=await player.boot({core:'js2me',rom:{fileName:'sample.jar',fileContent:'/game.jar'},retroarchConfig:buildPlayerRetroarchConfig(null,getPlatform('j2me').buttons)});
 return {startupMs:Math.round(performance.now()-begin),status:emu.getStatus(),booting:player.booting.value,error:player.error.value?.message||null,snapshots:player.coreSupportsSaveState()};
};` : `
import {prepareJ2me} from '/src/composables/player/j2meRuntime.js';
window.stop=async()=>{if(window.emu){await emu.exit();emu.getCanvas().remove()}};
window.key=(down)=>emu[down?'pressDown':'pressUp']({button:'l2'});
window.boot=async()=>{await stop();const begin=performance.now();window.emu=await prepareJ2me({rom:{fileName:'sample.jar',fileContent:'/game.jar'}});document.getElementById('host').append(emu.getCanvas());await emu.start();return {startupMs:Math.round(performance.now()-begin),status:emu.getStatus()}};`}
window.sample=()=>{const c=emu.getCanvas(),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let opaque=0,hash=2166136261;const colors=new Set();for(let i=0;i<p.length;i+=4){if(p[i+3])opaque++;colors.add((p[i]<<24|p[i+1]<<16|p[i+2]<<8|p[i+3])>>>0);for(let j=0;j<4;j++)hash=Math.imul(hash^p[i+j],16777619)}return {status:emu.getStatus(),opaque,colors:colors.size,hash:hash>>>0}};
</script>`
const server=createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,origin).pathname
 if(pathname==='/'){res.setHeader('content-type','text/html');res.end(page);return}
 if(pathname==='/game.jar'){res.end(bytes);return}
 let file
 if (/^\/(shared\/registry|node_modules\/(vue|nostalgist)\/dist)\/[\w/.-]+\.js$/.test(pathname)) {
  file=path.resolve(repo,'.'+pathname)
  if(!file.startsWith(repo+path.sep))throw Error('invalid path')
 } else {
  if(!pathname.startsWith('/j2me/')&&!pathname.startsWith('/src/'))throw Error('not found')
  file=path.resolve(root,pathname.startsWith('/j2me/')?'public'+pathname:'.'+pathname)
  if(!file.startsWith(root+path.sep))throw Error('invalid path')
 }
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(await readFile(file))
}catch(e){res.statusCode=404;res.end(e.message)}})
await new Promise((r,j)=>{server.once('error',j);server.listen(httpPort,'127.0.0.1',r)})
const profile=await mkdtemp(path.join(tmpdir(),'j2me-real-chrome-'))
const chrome=spawn(chromePath,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--user-data-dir='+profile,'--remote-debugging-port='+debugPort,'about:blank'],{stdio:'ignore'})
const delay=ms=>new Promise(r=>setTimeout(r,ms)),logs=[],results=[]
let ws,send
try {
 let target
 for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json()).find(t=>t.type==='page'&&t.url==='about:blank');if(target)break}catch{}await delay(100)}
 assert.ok(target,'No Chromium target')
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
 let next=0;const pending=new Map()
 send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++next;const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},45000);pending.set(id,m=>{clearTimeout(timeout);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result)});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))})
 ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);return}if(m.method==='Target.attachedToTarget'){send('Runtime.enable',{},m.params.sessionId).catch(()=>{})}if(m.method==='Runtime.consoleAPICalled')logs.push({time:Date.now(),level:m.params.type,text:m.params.args.map(a=>a.value??a.description).join(' ')});if(m.method==='Runtime.exceptionThrown')logs.push({exception:m.params})}
 await send('Runtime.enable');await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});await send('Page.navigate',{url:origin})
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
 for(let i=0;i<50&&!await evaluate('typeof boot === "function"');i++)await delay(100)
 const capture=async name=>{const shot=await send('Page.captureScreenshot');await writeFile(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));const data=await evaluate('emu.getCanvas().toDataURL()');await writeFile(path.join(out,name+'-canvas.png'),Buffer.from(data.split(',')[1],'base64'));return evaluate('sample()')}
 for(let run=1;run<=Number(process.env.J2ME_TEST_RUNS||2);run++){
  const boot=await evaluate('boot()');assert.ok(boot.startupMs<30000,'default 30-second start must pass')
  if(playerEntry){assert.equal(boot.booting,false);assert.equal(boot.error,null);assert.equal(boot.snapshots,false)}
  await delay(12000)
  const before=await capture('run'+run+'-before5')
  await evaluate('key(true)');await delay(350);await evaluate('key(false)')
  await delay(12000)
  const after=await capture('run'+run+'-after5')
  assert.equal(after.status.state,'running');assert.ok(after.opaque>0);assert.notEqual(after.hash,before.hash,'phone 5 must change the visible frame')
  results.push({run,...boot,before,after});console.log(JSON.stringify(results.at(-1)))
 }
 await evaluate('stop()')
 assert.equal(await evaluate("document.querySelectorAll('iframe').length"),0,'Exit must dispose the Java sandbox')
} finally {
 await writeFile(path.join(out,'results.json'),JSON.stringify({entry,romPath,bytes:bytes.length,results},null,2))
 await writeFile(path.join(out,'runtime-log.json'),JSON.stringify(logs,null,2))
 ws?.close();chrome.kill('SIGTERM');await new Promise(r=>chrome.exitCode!==null?r():chrome.once('exit',r));server.closeAllConnections();await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true,maxRetries:3})
}
console.log('Evidence: '+out)
