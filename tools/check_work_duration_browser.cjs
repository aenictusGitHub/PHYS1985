'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium,webkit,firefox}=require('playwright');
const url=pathToFileURL(path.join(__dirname,'..','puissance_travail_webapp_fr.html')).href;
const input=(page,id,value)=>page.locator('#'+id).evaluate((el,value)=>{
  el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));
},value);
(async()=>{
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit],['firefox',firefox]]){
    const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
    try{
      const page=await browser.newPage({viewport:{width:919,height:805}}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url);await page.waitForFunction(()=>window.PhysShare?.ready);
      for(const field of ['cellular','periodic','central','vortex','rotating','traveling','gravity']){
        await page.selectOption('#force-field-select',field);
        assert.equal(await page.locator('#duration-slider').getAttribute('max'),'100');
        await input(page,'duration-slider',100);
        assert.equal(await page.locator('#duration-slider').inputValue(),'100');
        assert.equal(await page.locator('#time-slider').getAttribute('max'),'100');
        assert.equal(await page.locator('#duration-output-digits').getAttribute('data-value'),'100.00');
        await input(page,'time-slider',100);
        assert.equal(await page.locator('#time-badge-digits').getAttribute('data-value'),'100.00');
        assert(await page.locator('#final-work-area').isVisible());
        const values=await page.locator('#power-readout,#work-readout,#delta-k-readout,#theorem-readout').evaluateAll(es=>es.map(e=>Number(e.dataset.value)));
        assert(values.every(Number.isFinite),field+': finite readouts');
        assert(Math.abs(values[3])<.0002,field+': work–energy agreement at 100 s');
        assert.equal(await page.locator('mjx-merror,[data-mml-node="merror"]').count(),0);
      }
      // Duration, final time and final area survive a shared configuration.
      const shared=await browser.newPage();
      await shared.goto(await page.evaluate(()=>PhysShare.makeLink()));
      await shared.waitForFunction(()=>window.PhysShare?.ready);
      assert.equal(await shared.locator('#duration-slider').inputValue(),'100');
      assert.equal(await shared.locator('#time-slider').inputValue(),'100');
      assert(await shared.locator('#final-work-area').isVisible());
      await shared.close();
      await page.selectOption('#force-field-select','cellular');
      assert.equal(await page.locator('#duration-slider').inputValue(),'100','non-gravity duration is preserved');
      await input(page,'time-slider',99.99);await page.click('#play-button');
      await page.waitForFunction(()=>document.getElementById('play-button').textContent==='Lire'&&document.getElementById('time-slider').value==='100');
      assert(await page.locator('#final-work-area').isVisible());
      assert.deepEqual(errors,[]);
      console.log('PASS',name,'100 s: all seven fields, finite values, energy theorem, shared links and playback end');
    }finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
