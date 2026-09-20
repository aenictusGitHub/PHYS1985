'use strict';
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const {pathToFileURL} = require('node:url'), playwright = require('playwright');
const root = path.resolve(process.argv[2] || path.join(__dirname,'..'));
const out = process.env.RESULT_DIR || fs.mkdtempSync(path.join(os.tmpdir(),'phys-mobile-'));
fs.mkdirSync(out,{recursive:true});
const kinds = ['point','fly','butterfly','ladybug','tore'];
const apps = ['cinematique_2d','cinematique_3d'];
const engines = (process.env.ENGINES || 'chromium,webkit,firefox').split(',');
const stripped = snapshot => {
  const value = structuredClone(snapshot);
  delete value.data.state.mobileAppearance; delete value.controls['mobile-appearance'];
  return value;
};
async function instrument(page) {
  await page.addInitScript(() => {
    let mobile;
    Object.defineProperty(window,'PhysMobile',{configurable:true,get:()=>mobile,set:value=>{
      mobile = {...value,draw(ctx,kind,x,y,options){
        window.__mobileDraw = {kind,x,y,...options};
        const before = [ctx.getTransform().toString(),ctx.fillStyle,ctx.strokeStyle,ctx.lineWidth,ctx.shadowBlur];
        const result = value.draw(ctx,kind,x,y,options);
        const after = [ctx.getTransform().toString(),ctx.fillStyle,ctx.strokeStyle,ctx.lineWidth,ctx.shadowBlur];
        if (JSON.stringify(before)!==JSON.stringify(after)) throw Error('Mobile renderer leaked canvas state');
        return result;
      }};
    }});
    let mobile3d;
    Object.defineProperty(window,'PhysMobile3D',{configurable:true,get:()=>mobile3d,set:value=>{
      mobile3d={...value,draw(ctx,kind,position,options){
        const p=options.project(position),f=options.frame?.forward;
        const next=f?options.project({x:position.x+f.x,y:position.y+f.y,z:position.z+f.z}):null;
        window.__mobileDraw={kind,x:p.x,y:p.y,angle:next?Math.atan2(next.y-p.y,next.x-p.x):0,time:options.time,frame:options.frame,position};
        const before=[ctx.getTransform().toString(),ctx.fillStyle,ctx.strokeStyle,ctx.lineWidth,ctx.globalAlpha];
        const result=value.draw(ctx,kind,position,options);
        const after=[ctx.getTransform().toString(),ctx.fillStyle,ctx.strokeStyle,ctx.lineWidth,ctx.globalAlpha];
        if(JSON.stringify(before)!==JSON.stringify(after))throw Error('3D mobile renderer leaked canvas state');
        return result;
      }};
    }});
  });
}
(async()=>{
  let cases=0;
  for (const engine of engines) {
    const browser = await playwright[engine].launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
    try {
      for (const app of apps) for (const viewport of [{width:1280,height:900},{width:768,height:1024}]) {
        const tablet = viewport.width===768;
        const page = await browser.newPage({viewport,hasTouch:tablet,deviceScaleFactor:tablet?2:1,...(tablet&&engine!=='firefox'?{isMobile:true}:{})});
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
        try {
          await instrument(page);
          const url=pathToFileURL(path.join(root,app+'_webapp_fr.html')).href;
          await page.goto(url);await page.waitForFunction(()=>window.PhysShare?.ready);
          const select=page.locator('#mobile-appearance'), canvas=page.locator(app==='cinematique_2d'?'#scene-canvas':'#viewport > canvas');
          assert.equal(await select.inputValue(),'point');
          assert.deepEqual(await select.locator('option').evaluateAll(xs=>xs.map(e=>e.value)),kinds);
          assert.deepEqual(await select.locator('option').allTextContents(),['Point','Mouche','Papillon','Coccinelle','Toré']);
          await select.scrollIntoViewIfNeeded();
          if(tablet)assert((await select.boundingBox()).height>=44);
          const baseline=await page.evaluate(()=>PhysShare.capture());
          const at=await page.evaluate(()=>window.__mobileDraw);
          for(const kind of kinds) {
            await select.selectOption(kind);
            const snap=await page.evaluate(()=>PhysShare.capture()),draw=await page.evaluate(()=>window.__mobileDraw);
            assert.equal(snap.data.state.mobileAppearance,kind);assert.equal(draw.kind,kind);
            assert.equal(draw.x,at.x);assert.equal(draw.y,at.y);
            assert.deepEqual(stripped(snap),stripped(baseline),'appearance changes no physics/view/time/options');
            assert.equal(await page.locator('#play-button').innerText(),'Lire');
            await canvas.screenshot({path:path.join(out,`${engine}-${app}-${viewport.width}-${kind}.png`)});
            const link=await page.evaluate(()=>PhysShare.makeLink());
            await page.goto(link);await page.waitForFunction(()=>window.PhysShare?.ready);
            assert.equal(await select.inputValue(),kind);assert.equal(await page.locator('#play-button').innerText(),'Lire');
            assert.deepEqual(await page.evaluate(()=>PhysShare.capture()),snap,'appearance round-trip');
            cases++;
          }
          // Earlier local links using the replaced ball now show a ladybug.
          const beforeMigration=await page.evaluate(()=>PhysShare.capture());
          await page.evaluate(async()=>{
            const old=PhysShare.capture();old.data.state.mobileAppearance='ball';old.controls['mobile-appearance']='ball';
            await PhysShare.restore(old);
          });
          assert.equal(await select.inputValue(),'ladybug');
          assert.equal(await page.evaluate(()=>window.__mobileDraw.kind),'ladybug');
          assert.deepEqual(stripped(await page.evaluate(()=>PhysShare.capture())),stripped(beforeMigration));
          // Old links did not have the new field/control: they must still open as a point.
          await page.evaluate(async()=>{
            const old=PhysShare.capture();delete old.data.state.mobileAppearance;delete old.controls['mobile-appearance'];
            await PhysShare.restore(old);
          });
          assert.equal(await select.inputValue(),'point');
          assert.equal(await page.evaluate(()=>PhysShare.capture().data.state.mobileAppearance),'point');
          const beforeInvalid=await page.evaluate(()=>PhysShare.capture());
          assert(await page.evaluate(async()=>{
            const s=PhysShare.capture();s.data.state.mobileAppearance='<img onerror=alert(1)>';
            try{await PhysShare.restore(s);return false;}catch{return true;}
          }));
          assert.deepEqual(await page.evaluate(()=>PhysShare.capture()),beforeInvalid);
          await page.locator('#play-button').click();
          await select.selectOption('tore');assert.equal(await page.locator('#play-button').innerText(),'Pause');
          await page.locator('#play-button').click();
          if(app==='cinematique_3d') for(const preset of ['front-view','side-view','top-view','reset-view']) {
            await page.locator('#'+preset).click();
            const draw=await page.evaluate(()=>window.__mobileDraw);
            assert(Number.isFinite(draw.angle));assert(Number.isFinite(draw.x));assert(Number.isFinite(draw.y));
          }
          // Exercise every trajectory and start/midpoint/end, including zero speed.
          if(engine==='chromium'&&!tablet){
            const trajectories=await page.locator('#trajectory-select option').evaluateAll(xs=>xs.map(e=>e.value));
            for(const trajectory of trajectories){
              await page.selectOption('#trajectory-select',trajectory);
              for(const fraction of [0,.5,1]){
                await page.locator('#time-slider').evaluate((e,f)=>{e.value=Number(e.max)*f;e.dispatchEvent(new Event('input',{bubbles:true}));},fraction);
                const physical=await page.evaluate(()=>PhysShare.capture());
                for(const kind of kinds){
                  await select.selectOption(kind);
                  const draw=await page.evaluate(()=>window.__mobileDraw);
                  assert(Number.isFinite(draw.angle)&&Number.isFinite(draw.x)&&Number.isFinite(draw.y));
                  assert.deepEqual(stripped(await page.evaluate(()=>PhysShare.capture())),stripped(physical));
                  cases++;
                }
              }
            }
            // Normal playback (not the WebDriver-specific static preview).
            await page.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
            await page.goto(url);await page.waitForFunction(()=>window.PhysShare?.ready);
            await page.locator('#play-button').click();
            const time=await page.evaluate(()=>PhysShare.capture().data.state.time);
            await select.selectOption('tore');
            assert.equal(await page.evaluate(()=>PhysShare.capture().data.state.time),time);
            await page.locator('#play-button').click();
            await page.waitForFunction(t=>PhysShare.capture().data.state.time>t+.15,time);
            await page.locator('#play-button').click();
            const paused=await page.evaluate(()=>window.__mobileDraw);
            await page.waitForTimeout(120);
            assert.deepEqual(await page.evaluate(()=>window.__mobileDraw),paused,'illustration stays frozen in pause');
          }
          assert.deepEqual(errors,[]);assert.equal(await page.locator('[data-mml-node="merror"]').count(),0);
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
          console.log(`PASS ${engine} ${app} ${viewport.width}: drawings, invariant physics, sharing, old links, controls.`);
        } finally {await page.close();}
      }
    } finally {await browser.close();}
  }
  console.log(`${cases} appearance cases passed. Screenshots: ${out}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
