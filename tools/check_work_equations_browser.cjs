'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname,'..','puissance_travail_webapp_fr.html')).href);
    await page.waitForFunction(()=>document.getElementById('loading-message').hidden);
    let cases=0;
    for(const width of [1440,1024,390,320]) {
      await page.setViewportSize({width,height:1000});
      for(const mode of ['free','paths','integrals']) {
        await page.selectOption('#motion-mode',mode);
        const selector=mode==='free'?'#force-field-select':'#path-field';
        const fields=await page.locator(selector+' option').evaluateAll(els=>els.map(el=>el.value));
        for(const field of fields) {
          await page.selectOption(selector,field);
          const section=page.locator((mode==='free'?'#free-controls':'#path-controls')+' .equation-section');
          await section.scrollIntoViewIfNeeded();
          const layout=await section.evaluate(el=>{
            const panel=document.querySelector('.control-panel'),r=el.getBoundingClientRect(),css=getComputedStyle(el);
            const left=r.left+parseFloat(css.paddingLeft),right=r.right-parseFloat(css.paddingRight);
            const formulas=[...el.querySelectorAll('mjx-container[display="true"] > svg')].filter(svg=>svg.getBoundingClientRect().width).map(svg=>{
              const b=svg.getBoundingClientRect();
              const clone=svg.cloneNode(true);clone.style.maxWidth='none';clone.style.position='absolute';clone.style.visibility='hidden';
              svg.parentElement.append(clone);const natural=clone.getBoundingClientRect().width;clone.remove();
              return {left:b.left,right:b.right,width:b.width,height:b.height,ratio:b.width/natural};
            });
            return {panelWidth:panel.clientWidth,panelScroll:panel.scrollWidth,left,right,formulas,
              boxes:[...el.querySelectorAll('.equations')].filter(e=>e.getBoundingClientRect().width).map(e=>({width:e.clientWidth,scroll:e.scrollWidth})),
              documentWidth:document.documentElement.clientWidth,documentScroll:document.documentElement.scrollWidth};
          });
          const context=mode+'/'+field+'/'+width;
          assert(layout.panelScroll<=layout.panelWidth+1,'No sidebar overflow: '+context);
          assert(layout.documentScroll<=layout.documentWidth+1,'No page overflow: '+context);
          assert(layout.boxes.every(b=>b.scroll<=b.width+1),'No nested horizontal equation scrolling: '+context);
          assert(layout.formulas.length>=3,'All relations remain visible: '+context);
          for(const f of layout.formulas){
            assert(f.left>=layout.left-1&&f.right<=layout.right+1,'Formula inside the panel: '+context);
            assert(f.ratio>=.9,'Reflow, not tiny mathematical text: '+context+' / '+f.ratio);
            assert(f.width>0&&f.height>0);
          }
          assert.equal(await page.locator('mjx-merror,[data-mml-node="merror"]').count(),0,context);
          if(process.env.SCREENSHOT_DIR&&mode==='paths'&&field==='cellular')
            await section.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`work-equations-${width}.png`)});
          cases++;
        }
      }
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: '+cases+' field/mode/viewport combinations; readable multiline formulas, no sidebar/page overflow, no clipping and no MathJax errors.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
