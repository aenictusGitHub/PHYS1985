const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
 const p=await browser.newPage();await p.goto('file://'+path.join(root,'equilibres_statiques_webapp_fr.html'));await p.waitForFunction(()=>window.PhysShare?.ready);
 const source=await p.evaluate(()=>PhysShare.capture());
 assert(await p.evaluate(async()=>{const s=PhysShare.capture();return JSON.stringify(await PhysShare.decode(await PhysShare.encode(s)))===JSON.stringify(s);}));
 for(const bad of ['garbage','2z.ABCD','1z.notGzip','1j.'+Buffer.from('{"__proto__":{"polluted":true}}').toString('base64url'),'1j.'+Buffer.from('{"n":1e999}').toString('base64url')]){
  assert(await p.evaluate(async bad=>{try{await PhysShare.decode(bad);return false;}catch(_){return true;}},bad));
 }
 const atomic=await p.evaluate(async()=>{const before=PhysShare.capture(),bad=PhysShare.clone(before);bad.data.p.F1=1e9;try{await PhysShare.restore(bad);return false;}catch(_){return JSON.stringify(before)===JSON.stringify(PhysShare.capture());}});assert(atomic,'invalid parameters preserve the existing state');
 const wrong={...source,app:'another-app'};const token=await p.evaluate(s=>PhysShare.encode(s),wrong);
 for(const hash of ['1z.broken',token]){const q=await browser.newPage();await q.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));await q.goto('file://'+path.join(root,'cinematique_2d_webapp_fr.html')+'#configuration='+hash);await q.waitForFunction(()=>window.PhysShare?.ready);assert.match(await q.locator('.phys-share-status').innerText(),/Lien non chargé/);assert.equal(await q.getByRole('button',{name:'Pause',exact:true}).count(),0);await q.close();}
 // Force the clipboard fallback (e.g. local files and restricted browser permissions).
 await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(Error('Denied'))},configurable:true}));
 await p.click('#share-configuration');await p.waitForFunction(()=>document.querySelector('.phys-share-status').textContent.includes('Copiez'));
 const link=await p.locator('#share-configuration-link').inputValue();assert(link.includes('#configuration=1'));assert.equal(await p.locator('#share-configuration-link').evaluate(e=>e.selectionEnd-e.selectionStart),link.length);
 assert.equal(await p.evaluate(()=>({}).polluted),undefined);
 await p.evaluate(()=>{const e=document.getElementById('F1');e.value=13;e.dispatchEvent(new Event('input'));});
 assert.notDeepEqual((await p.evaluate(()=>PhysShare.capture())).data,source.data);
 const secondLink=await p.evaluate(()=>PhysShare.makeLink());
 await p.evaluate(url=>{location.hash=new URL(url).hash;},link);
 await p.waitForFunction(expected=>JSON.stringify(PhysShare.capture().data)===JSON.stringify(expected),source.data);
 await p.evaluate(url=>{location.hash=new URL(url).hash;},secondLink);
 await p.waitForFunction(()=>PhysShare.capture().data.p.F1===13);
 assert.equal(await p.locator('#share-configuration-link').inputValue(),secondLink);
 await p.goBack();await p.waitForFunction(expected=>JSON.stringify(PhysShare.capture().data)===JSON.stringify(expected),source.data);
 assert.equal(await p.getByRole('button',{name:'Pause',exact:true}).count(),0);
 console.log('PASS: codec, invalid/truncated/cross-app links, numeric validation, atomic rollback, pause, clipboard fallback and same-tab hash navigation.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
