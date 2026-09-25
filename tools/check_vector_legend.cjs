'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium,webkit,firefox}=require('playwright');
const root=path.join(__dirname,'..');
async function inspect(page) {
  const report=await page.evaluate(()=>{
    const visible=e=>e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height>0;
    const selected=[...document.querySelectorAll('.vector-options input:checked')].map(e=>e.id.replace('toggle-',''));
    const items=[...document.querySelectorAll('.vector-legend-item')].filter(visible);
    const boxes=[...document.querySelectorAll('.time-badge,.vector-legend,.viewport-toolbar')].filter(visible).map(e=>({id:e.className,r:e.getBoundingClientRect()}));
    const viewport=document.getElementById('viewport').getBoundingClientRect(),issues=[];
    const overlaps=(a,b)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)+1 && Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1;
    for(let i=0;i<boxes.length;i++) {
      const a=boxes[i];
      if(a.r.left<viewport.left || a.r.right>viewport.right+1)issues.push('outside viewport '+a.id);
      for(let j=i+1;j<boxes.length;j++)if(overlaps(a.r,boxes[j].r))issues.push(a.id+' overlaps '+boxes[j].id);
    }
    if(document.body.dataset.app==='kinematics-2d')for(const label of document.querySelectorAll('.axis-title-label')){
      if(visible(label)&&boxes.filter(b=>b.id!=='viewport-toolbar').some(b=>overlaps(label.getBoundingClientRect(),b.r)))issues.push('axis title overlaps time/legend');
    }
    return {selected,keys:items.map(e=>e.dataset.vector),issues,
      math:items.every(e=>!!e.querySelector('mjx-container svg')&&!!e.getAttribute('aria-label')),
      colors:items.every(e=>getComputedStyle(e).color===getComputedStyle(document.querySelector('.swatch-'+e.dataset.vector)).backgroundColor),
      arrows:items.every(e=>{
        const arrow=e.querySelector('.vector-legend-arrow'),shape=arrow?.querySelector('path');
        if(!arrow||!shape||!visible(arrow)||arrow.getAttribute('aria-hidden')!=='true')return false;
        if(document.body.dataset.app==='kinematics-3d'){
          const paths=[...arrow.querySelectorAll('path')];
          const base=document.createElement('span');base.style.color=arrow.dataset.color;
          return arrow.dataset.rendering==='3d'&&
            base.style.color===e.style.color&&
            !!arrow.querySelector('[data-part="shaft"]')&&!!arrow.querySelector('[data-part="head"]')&&
            new Set(paths.map(p=>p.getAttribute('fill'))).size>=6&&
            paths.every(p=>!p.getAttribute('d').includes('NaN'));
        }
        return getComputedStyle(shape).fill===getComputedStyle(e).color;
      }),
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      errors:document.querySelectorAll('mjx-merror,[data-mml-node="merror"]').length};
  });
  assert.deepEqual(report.keys,report.selected);assert.deepEqual(report.issues,[]);
  assert(report.math);assert(report.colors);assert(report.arrows);assert(!report.overflow);assert.equal(report.errors,0);
}
(async()=>{
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit],['firefox',firefox]]) {
    const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
    try {for(const dim of [2,3])for(const lang of ['fr','en']){
      const context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(pathToFileURL(path.join(root,'cinematique_'+dim+'d_webapp_fr.html')).href+'?lang='+lang);
      await page.waitForFunction(()=>window.PhysShare?.ready);
      if(await page.locator('#play-button').innerText()==='Pause')await page.locator('#play-button').click();
      await inspect(page);
      const time=await page.locator('#time-slider').inputValue();
      assert.equal(await page.locator('#vector-legend').getAttribute('aria-label'),lang==='fr'?'Légende des vecteurs':'Vector legend');
      for(const preset of ['all','velocity','acceleration','decomposition']){
        await page.click('[data-vector-preset="'+preset+'"]');await inspect(page);
        assert.equal(await page.locator('#time-slider').inputValue(),time);
      }
      await page.click('#clear-vectors');await inspect(page);
      assert(await page.locator('#vector-legend').isHidden());
      await page.click('[data-vector-preset="all"]');
      const shared=await context.newPage();await shared.goto(await page.evaluate(()=>PhysShare.makeLink()));
      await shared.waitForFunction(()=>window.PhysShare?.ready);await inspect(shared);
      assert.equal(await shared.locator('.vector-legend-item:visible').count(),6);
      await shared.close();
      if(name==='chromium'&&lang==='fr')await page.locator('#viewport').screenshot({path:'/private/tmp/vector-legend-'+dim+'d.png'});
      for(const width of [1024,834,620,390,320]){
        await page.setViewportSize({width,height:1000});
        for(const preset of ['all','velocity']){await page.click('[data-vector-preset="'+preset+'"]');await inspect(page);}
      }
      assert.deepEqual(errors,[]);await context.close();
      console.log('PASS vector legend',name,dim+'D',lang,'selection, colored arrows, TeX, presets, sharing, tablet and narrow layouts');
    }}finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
