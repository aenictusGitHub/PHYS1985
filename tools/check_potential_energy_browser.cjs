'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      window.__localParabolas={};
      const p=CanvasRenderingContext2D.prototype,clear=p.clearRect,stroke=p.stroke;
      p.clearRect=function(...a){window.__localParabolas[this.canvas.id]=0;return clear.apply(this,a);};
      p.stroke=function(...a){if(this.strokeStyle==='#2775b6'&&Math.abs(this.lineWidth-2.2)<1e-6&&this.getLineDash().join(',')==='6,4')window.__localParabolas[this.canvas.id]++;return stroke.apply(this,a);};
    });
    await page.goto(pathToFileURL(process.env.POTENTIAL_HTML||path.join(__dirname,'..','potentiel_force_webapp_fr.html')).href);
    await page.waitForFunction(()=>document.getElementById('loading').hidden);
    assert.equal(await page.locator('.motion-summary').count(),0);
    assert(!(await page.locator('#motion-diagnostics').isVisible()));
    for(const id of ['equilibrium-settings','plane-equilibrium-settings'])assert.equal(await page.locator('#'+id).evaluate(e=>e.open),false,'Equilibria folded by default');
    assert(!(await page.locator('#equilibrium-buttons').isVisible()));
    const checkDisclosureKeys=async selector=>{
      await page.locator(selector+' > summary').focus();await page.keyboard.press('Space');
      assert(await page.locator(selector).evaluate(e=>e.open),'Space opens the disclosure');
      assert.equal(await page.locator('#motion-play').textContent(),'Lire','Space on a disclosure does not start motion');
      await page.keyboard.press('Enter');assert(!(await page.locator(selector).evaluate(e=>e.open)),'Enter closes the disclosure');
    };
    await checkDisclosureKeys('.motion-settings');await checkDisclosureKeys('#equilibrium-settings');
    for(const id of ['position','plane-x','plane-y']){
      assert.equal(await page.locator('#'+id).count(),1,'Unique position input');
      assert(await page.locator('#'+id).evaluate(e=>e.closest('details')?.classList.contains('motion-settings')),'Position belongs to initial conditions');
      assert(!(await page.locator('#'+id).isVisible()),'Position folded by default');
    }
    assert.equal(await page.locator('.dimension-options [data-tex] mjx-container svg').count(),3,'Both dimension choices use rendered LaTeX');
    assert(!/Sortir|balayage/.test(await page.locator('#energy-guide > p.microcopy').textContent()));
    assert(!/Les intersections/.test(await page.locator('#plane-energy-guide > p.microcopy').textContent()));
    assert(!(await page.locator('#energy-accessibility').isChecked()));assert(!(await page.locator('#energy-guide').isVisible()));
    const selectDimension=async value=>{await page.click('#dimension-toggle');await page.click('#dimension-'+value);};
    await page.locator('#dimension-toggle').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
    assert.equal(await page.locator('#dimension').inputValue(),'2','Keyboard selects two dimensions');
    assert(!(await page.locator('#plane-energy-guide').isVisible()));
    await checkDisclosureKeys('#plane-equilibrium-settings');await page.locator('#dimension-toggle').focus();
    await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');assert.equal(await page.locator('#dimension').inputValue(),'1');
    await page.click('#dimension-toggle');await page.keyboard.press('End');await page.keyboard.press('Escape');assert.equal(await page.locator('#dimension').inputValue(),'1','Escape cancels the pending choice');
    await page.click('#dimension-toggle');await page.keyboard.press('Tab');assert(!(await page.locator('#dimension-options').isVisible()));
    await page.click('#dimension-toggle');await page.locator('.app-header h1').click();assert(!(await page.locator('#dimension-options').isVisible()));
    // Previous links with radio controls remain compatible; saved overlays win over defaults.
    await selectDimension('2');await page.check('#energy-accessibility');
    const legacy=await page.evaluate(()=>{const s=PhysShare.capture();s.controls['dimension-1']=false;s.controls['dimension-2']=true;return s;});
    await selectDimension('1');await page.uncheck('#energy-accessibility');
    await page.evaluate(s=>PhysShare.restore(s),legacy);
    assert.equal(await page.locator('#dimension-2').getAttribute('aria-selected'),'true');assert(await page.locator('#view-2d').isVisible());
    assert(await page.locator('#energy-accessibility').isChecked());assert(await page.locator('#plane-energy-guide').isVisible());
    const set=async(id,value)=>page.locator('#'+id).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},value);
    await page.locator('.motion-settings > summary').click();
    assert(await page.locator('#plane-x').isVisible());assert(await page.locator('#plane-y').isVisible());assert(!(await page.locator('#position').isVisible()));
    await set('plane-x',-.4);await set('plane-y',.7);
    assert.deepEqual(await page.evaluate(()=>PhysShare.capture().data.motion.initial),[-.4,.7]);
    await page.locator('.motion-settings > summary').click();assert(!(await page.locator('#plane-x').isVisible()));
    await selectDimension('1');await page.locator('.motion-settings > summary').click();
    assert(await page.locator('#position').isVisible());assert(!(await page.locator('#plane-x').isVisible()));
    await set('position',.42);assert.deepEqual(await page.evaluate(()=>PhysShare.capture().data.motion.initial),[.42]);
    await page.locator('.motion-settings > summary').click();
    const shot=async(name,selector)=>{if(process.env.SCREENSHOT_DIR)await page.locator(selector).screenshot({path:path.join(process.env.SCREENSHOT_DIR,name+'.png')});};
    const overflow=async()=>{
      const bad=await page.evaluate(()=>{
        const el=document.documentElement,sidebar=document.querySelector('.control-panel');
        return {page:el.scrollWidth-el.clientWidth,sidebar:sidebar.scrollWidth-sidebar.clientWidth,
          guides:[...document.querySelectorAll('.energy-guide')].filter(e=>e.getBoundingClientRect().width).map(e=>e.scrollWidth-e.clientWidth)};
      });
      assert(bad.page<=1&&bad.sidebar<=1&&bad.guides.every(v=>v<=1),JSON.stringify(bad));
    };
    for(const width of [1440,1024,919,390,320]){
      await page.setViewportSize({width,height:1100});
      await selectDimension('1');
      for(const model of ['wells','pair','gravity']){
        await page.selectOption('#model-select',model);
        assert(await page.locator('#energy-guide').isVisible());
        assert(await page.locator('.zero-reference-legend').isVisible());
        const notation=await page.locator('#force-relation').getAttribute('data-math');
        assert.match(notation,/\\frac\{dU\}\{d[xr]\}/,'Italic d in the derivative');
        const styles=await page.evaluate(()=>{
          const energy=getComputedStyle(document.querySelector('.energy-mark'));
          const zero=getComputedStyle(document.querySelector('.zero-reference-mark'));
          const forbidden=getComputedStyle(document.querySelector('.forbidden-mark'));
          return {energy:energy.borderTopColor,zero:zero.borderTopStyle,forbidden:forbidden.backgroundColor};
        });
        assert.deepEqual(styles,{energy:'rgb(22, 126, 139)',zero:'solid',forbidden:'rgb(238, 241, 244)'});
        await page.locator('#equilibrium-settings > summary').click();
        if(model==='gravity'){
          assert(await page.locator('#no-equilibrium').isVisible());assert(!(await page.locator('#equilibrium-help').isVisible()));
          assert.equal(await page.locator('#equilibrium-buttons button').count(),0);
        }else{
          assert(await page.locator('#equilibrium-help').isVisible());
          for(const button of await page.locator('#equilibrium-buttons button').all()){
            await button.click();assert.equal(await button.getAttribute('data-selected'),'true');
            assert(await page.locator('#quadratic-legend').isVisible());assert(await page.locator('#quadratic-formula svg').isVisible());
            assert.equal(await page.evaluate(()=>window.__localParabolas['potential-canvas']),1);
            assert.equal(await page.evaluate(()=>window.__localParabolas['force-canvas']),0);
            await overflow();
            if(width===1440||width===320)await shot(`${model}-parabola-${await button.getAttribute('data-q')}-${width}`,'#view-1d .curves-card');
          }
        }
        await page.locator('#equilibrium-settings > summary').click();
        assert(!(await page.locator('#equilibrium-buttons').isVisible()));
        if(model!=='gravity')assert(await page.locator('#quadratic-note').isVisible(),'Collapsing keeps the selected parabola');
        await page.locator('#restart').click();assert(!(await page.locator('#quadratic-note').isVisible()));
        assert.equal(await page.evaluate(()=>window.__localParabolas['potential-canvas']),0);
        await overflow();
        await shot(`${model}-${width}`,'#view-1d .curves-card');
        const before=await page.locator('#energy-level-value').getAttribute('data-number');
        await set('motion-v0',model==='pair'?300:model==='gravity'?.015:2);
        const after=await page.locator('#energy-level-value').getAttribute('data-number');assert.notEqual(after,before);
        assert.match(await page.locator('#energy-regime').textContent(),model==='wells'?/franchissable/:/chappement/);
        await shot(`${model}-high-${width}`,'#view-1d .curves-card');
        await page.locator('#energy-accessibility').uncheck();assert(!(await page.locator('#energy-guide').isVisible()));
        await page.locator('#energy-accessibility').check();assert.equal(await page.locator('#energy-level-value').getAttribute('data-number'),after);
        await page.selectOption('#model-select','wells');await page.locator('#reset').click();
      }
      await selectDimension('2');
      for(const model of ['bowl','saddle','double']){
        await page.selectOption('#plane-model',model);await page.locator('#plane-show-surface').check();await overflow();
        await page.locator('#plane-equilibrium-settings > summary').click();
        for(const button of await page.locator('#plane-equilibria button').all()){
          await button.click();assert.equal(await button.getAttribute('data-selected'),'true');
          assert.equal(await page.evaluate(()=>window.__localParabolas['plane-x-canvas']),1);
          assert.equal(await page.evaluate(()=>window.__localParabolas['plane-y-canvas']),1);
          assert(await page.locator('#plane-hessian').isVisible());await overflow();
        }
        await page.locator('#plane-equilibrium-settings > summary').click();
        assert.equal(await page.evaluate(()=>window.__localParabolas['plane-x-canvas']),1,'Collapsing keeps the 2D approximation');
        await page.locator('#plane-reset').click();
        await shot(`${model}-map-${width}`,'.plane-card');await shot(`${model}-surface-${width}`,'#plane-surface-card');
        const E=await page.locator('#plane-energy-level').getAttribute('data-number');
        await page.locator('#motion-play').click();await page.waitForTimeout(150);
        assert.equal(await page.locator('#plane-energy-level').getAttribute('data-number'),E);
        if(await page.locator('#motion-play').textContent()==='Pause')await page.locator('#motion-play').click();
        await set('motion-v0',2);assert.notEqual(await page.locator('#plane-energy-level').getAttribute('data-number'),E);
        assert(await page.locator('#plane-velocity-key').isVisible());assert(await page.locator('#surface-velocity-key').isVisible());
        assert.equal(await page.locator('#plane-velocity-value').getAttribute('data-number'),String.raw`2.00|\mathrm{m\,s^{-1}}`);
        assert.notEqual(await page.locator('#plane-velocity-value svg').evaluate(e=>getComputedStyle(e).stroke),'rgb(119, 88, 166)','Force arrow styling must not affect numeric formulas');
        await set('motion-angle',-94);await shot(`${model}-velocity-${width}`,'.plane-card');await overflow();
        await set('motion-v0',0);assert(!(await page.locator('#plane-velocity-key').isVisible()));assert(!(await page.locator('#surface-velocity-key').isVisible()));
        await page.locator('#plane-show-surface').uncheck();
      }
    }
    assert.equal(await page.locator('mjx-merror,[data-mml-node="merror"]').count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: 30 model/viewport combinations; collapsible equilibria, local parabolas at minima/maxima and in 2D cuts, energy display, MathJax and horizontal layout.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
