'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium,webkit,firefox}=require('playwright');
const url=pathToFileURL(path.join(__dirname,'..','cinematique_3d_webapp_fr.html')).href;
const legacy=['trefoil','figureEightKnot','cinquefoil','harmonicKnot','sphericalRose','sphericalSpiral'];
async function menu(page){
  assert.deepEqual(await page.locator('#trajectory-select optgroup').evaluateAll(groups=>
    groups.slice(1,2).map(group=>[...group.querySelectorAll('option')].map(o=>o.value))),
    [['toroidalHelix','viviani']]);
  assert.equal(await page.locator('#trajectory-select optgroup').count(),3);
  assert.equal(await page.locator('#trajectory-select optgroup[label="Nœuds"],#trajectory-select optgroup[label="Knots"]').count(),0);
  assert.equal(await page.locator('#trajectory-select option').count(),11);
}
(async()=>{
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit],['firefox',firefox]]){
    const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
    try{for(const lang of ['fr','en']){
      const page=await browser.newPage({viewport:{width:897,height:794},hasTouch:true}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url+'?lang='+lang);await page.waitForFunction(()=>window.PhysShare?.ready);
      await menu(page);
      for(const key of ['toroidalHelix','viviani']){
        await page.selectOption('#trajectory-select',key);
        assert.equal(await page.evaluate(()=>PhysShare.capture().data.state.trajectoryKey),key);
      }
      for(const key of legacy){
        await page.evaluate(async key=>{
          const s=PhysShare.capture();s.data.state.trajectoryKey=key;s.data.state.time=0;
          s.controls['trajectory-select']=key;await PhysShare.restore(s);
        },key);
        assert.equal(await page.locator('#trajectory-select').inputValue(),key);
        assert.equal(await page.locator('#trajectory-select [data-legacy-trajectory]').count(),1);
        assert.equal(await page.evaluate(()=>PhysShare.capture().data.state.trajectoryKey),key);
      }
      const shared=await browser.newPage();await shared.goto(await page.evaluate(()=>PhysShare.makeLink()));
      await shared.waitForFunction(()=>window.PhysShare?.ready);
      assert.equal(await shared.locator('#trajectory-select').inputValue(),'sphericalSpiral');
      await shared.selectOption('#trajectory-select','lissajous');await menu(shared);
      assert.equal(await shared.locator('#trajectory-select [data-legacy-trajectory]').count(),0);
      await page.selectOption('#trajectory-select','viviani');await menu(page);
      assert.deepEqual(errors,[]);
      assert.equal(await page.locator('mjx-merror,[data-mml-node="merror"]').count(),0);
      await shared.close();await page.close();
      console.log('PASS simplified 3D menu',name,lang,'retained options, old configurations, shared links and cleanup');
    }}finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
