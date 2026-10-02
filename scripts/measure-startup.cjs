const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');
const {performance} = require('perf_hooks');
const workspace = path.join(require('os').tmpdir(), 'scribe-startup');
const label = (process.argv[3] || 'measurement').replace(/[^a-zA-Z0-9_-]/g, '_');
if (!process.argv[2] || typeof WebSocket === 'undefined') { console.error('Usage (Node 22+): node scripts/measure-startup.cjs /path/to/Scribe.app/Contents/MacOS/Scribe label [reuse]'); process.exit(1); }
const root=path.join(workspace,'notes');
fs.mkdirSync(root,{recursive:true});
for(let i=0;i<500;i++) {const folder=path.join(root,`Folder ${i%10}`);fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,`Note ${String(i).padStart(3,'0')}.md`);if(!fs.existsSync(file))fs.writeFileSync(file,`# Startup measurement ${i}\n\nEnglish and עברית content for startup measurement.\n\n${'A paragraph of ordinary note content.\n\n'.repeat(35)}`)}
async function run(index) {
 const profile=`${workspace}/profile-${label}-${process.argv[4]==='reuse'?0:index}`;fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'scribe-config.json'),JSON.stringify({notesPath:root}));
 const port=9330+index;const start=performance.now();
 const child=spawn(process.argv[2], [`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`],{stdio:'ignore'});
 let socket;let serial=0;const callbacks=new Map();let target;
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 try{
  while(performance.now()-start<15000){try{const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();target=targets.find(t=>t.type==='page');if(target)break}catch{}await wait(15)}
  if(!target)throw new Error('No renderer');
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j});
  socket.onmessage=e=>{const data=JSON.parse(e.data);if(data.id){callbacks.get(data.id)?.(data);callbacks.delete(data.id)}};
  const js=expression=>new Promise(r=>{const id=++serial;callbacks.set(id,r);socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}))}).then(r=>r.result?.result?.value);

  let shellMs,readyMs;
  while(performance.now()-start<15000){const state=await js(`({shell:!!document.querySelector('[aria-label="Search notes"]'),editor:!!document.querySelector('.tiptap[contenteditable="true"]'),rows:document.querySelectorAll('.note-list-row').length,error:document.body.innerText.includes('Something went wrong')})`);
   if(state?.shell&&!shellMs)shellMs=Math.round(performance.now()-start);
   if(state?.error)throw new Error('Renderer error');
   if(state?.editor&&state.rows===500){readyMs=Math.round(performance.now()-start);break}await wait(15)
  }
  if(!readyMs)throw new Error('Editor did not become ready');
  if(await js('window.scribeAPI.getNotesPath()')!==root)throw new Error('Benchmark profile was not isolated');
  console.log(JSON.stringify({run:index,shellMs,editorReadyMs:readyMs}));
  await wait(350);
  return {shellMs,editorReadyMs:readyMs};
 } finally {socket?.close();child.kill('SIGTERM');await new Promise(r=>child.once('exit',r))}
}
(async()=>{const values=[];for(let i=0;i<3;i++)values.push(await run(i));fs.writeFileSync(`${workspace}/${label}.json`,JSON.stringify(values));})().catch(e=>{console.error(e.message);process.exit(1)});
