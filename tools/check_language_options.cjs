/* Exercise English model/options text, including canvas labels and accessibility. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const apps='cinematique_2d,cinematique_3d,collisions,energie_mecanique,equilibres_statiques,frottements_solides,moment_cinetique,potentiel_force,poulies,puissance_travail'.split(',');
const french=/[éèêàçùœ]|\b(le|la|les|du|des|dans|sur|une|avec|pour|sont|est|pas|aucun|brin)\b/i;
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});let cases=0;
try{for(const app of apps){const page=await browser.newPage({viewport:{width:1200,height:900}}),misses=new Set,errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.drawnTexts=new Set;const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){drawnTexts.add(String(text));return original.call(this,text,...args);};});
await page.goto('file://'+path.join(root,app+'_webapp_fr.html')+'?lang=en');await page.waitForFunction(()=>PhysShare?.ready,null,{timeout:30000});
const audit=async()=>{cases++;await page.waitForTimeout(35);for(const text of await page.evaluate(()=>{
 const out=[...drawnTexts];drawnTexts.clear();const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(walk.nextNode()){const p=walk.currentNode.parentElement;if(!p.closest('script,style,mjx-container,textarea'))out.push(walk.currentNode.data.trim());}
 for(const e of document.querySelectorAll('[aria-label]'))out.push(e.getAttribute('aria-label'));
 for(const e of document.querySelectorAll('[data-math],[data-tex]')){
  for(const match of (e.dataset.math||e.dataset.tex).matchAll(/\\(?:text|mathrm)\{([^{}]*)\}/g))out.push(match[1]);
 }
 return out;
})){if(french.test(text.replace(/\\[A-Za-z]+/g,''))&&!['PHYS1985 · ULiège','Français','Toré','Université de Liège'].includes(text))misses.add(text);}
assert.equal(await page.locator('mjx-merror,[data-mml-node="merror"]').count(),0,app+' valid maths');};
const select=async(id,value)=>{await page.evaluate(({id,value})=>{const e=document.getElementById(id);if(!e.disabled&&![...e.options].find(o=>o.value===value)?.disabled){e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));}},{id,value});await audit();};
await audit();
for(const id of await page.locator('select:not(#phys-language)').evaluateAll(es=>es.map(e=>e.id).filter(Boolean))){
 for(const value of await page.locator('#'+id+' option').evaluateAll(es=>es.map(e=>e.value)))await select(id,value);
}
if(app==='potentiel_force'){
 await page.click('#dimension-toggle');await page.click('#dimension-2');await audit();
 for(const value of ['bowl','saddle','double'])await select('plane-model',value);
}
for(const id of await page.locator('input[type=checkbox]').evaluateAll(es=>es.map(e=>e.id).filter(Boolean))){await page.evaluate(id=>{const e=document.getElementById(id);if(!e.disabled){e.checked=!e.checked;e.dispatchEvent(new Event('change',{bubbles:true}));}},id);await audit();}
assert.deepEqual([...misses],[],app+' untranslated text');assert.deepEqual(errors,[],app+' errors');console.log('PASS '+app);await page.close();}
}finally{await browser.close();}console.log(cases+' English configuration checks passed.');})().catch(e=>{console.error(e);process.exitCode=1;});
