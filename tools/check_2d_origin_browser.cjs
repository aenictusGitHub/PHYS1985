'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const close=(a,b,tol=.02)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'webdriver',{get:()=>false});
    const proto=CanvasRenderingContext2D.prototype;
    for(const method of ['clearRect','beginPath','moveTo','lineTo','arc','fill','stroke','strokeRect']){
      const original=proto[method];
      proto[method]=function(...args){
        if(method==='clearRect')window.__scene={strokes:[],arrows:[]};
        if(method==='beginPath')this.__path=[];
        if(method==='moveTo'||method==='lineTo')(this.__path??=[]).push(args.slice(0,2));
        if(method==='arc'&&args[2]===7.2)window.__scene.particle=args.slice(0,2);
        if(method==='stroke'&&this.__path?.length)window.__scene.strokes.push({color:this.strokeStyle,width:this.lineWidth,path:this.__path.slice()});
        if(method==='fill'&&this.__path?.length)window.__scene.arrows.push({color:this.fillStyle,path:this.__path.slice()});
        if(method==='strokeRect'&&this.strokeStyle==='#bbcbd9')window.__scene.plot=args;
        return original.apply(this,args);
      };
    }
  });
  await page.goto(pathToFileURL(path.join(__dirname,'..','cinematique_2d_webapp_fr.html')).href);
  await page.waitForFunction(()=>!document.getElementById('loading-message'));
  if(await page.locator('#play-button').innerText()==='Pause')await page.locator('#play-button').click();
  await page.locator('#toggle-position').check();
  await page.locator('#toggle-velocity').check();
  await page.locator('#toggle-acceleration').check();
  await page.locator('#osculating-toggle').check();
  const seek=async t=>page.locator('#time-slider').evaluate((el,t)=>{el.value=t;el.dispatchEvent(new Event('input',{bubbles:true}));},t);
  const read=async()=>page.locator('.vector-readout').evaluateAll(els=>els.map(el=>Object.fromEntries(['magnitude','component-x','component-y'].map(name=>[name,Number(el.querySelector('.'+name+'-digits').dataset.value)]))));
  const scene=()=>page.evaluate(()=>window.__scene);
  const reset=async()=>{if(await page.locator('#reset-origin').isEnabled())await page.locator('#reset-origin').click();};
  const mode=async enabled=>{if((await page.locator('#move-origin').getAttribute('aria-pressed'))!==String(enabled))await page.locator('#move-origin').click();};
  const origin=async()=>page.locator('#origin-transform').evaluate(el=>({x:Number(el.querySelector('#origin-x-digits').dataset.value),y:Number(el.querySelector('#origin-y-digits').dataset.value)}));
  const checkEquations=async(key,o)=>{
    const base=key==='ballistic'?{x:0,y:0}:key==='cycloid'?{x:.8,y:1.3}:{x:4,y:4};
    for(const axis of ['x','y'])close(Number(await page.locator(`[data-offset-axis="${axis}"]`).getAttribute('data-value')),base[axis]-o[axis]);
    const gaps=await page.locator('.equation-numeric .math-digits').evaluateAll(els=>els.map(el=>{
      const left=el.previousElementSibling.getBoundingClientRect(),number=el.getBoundingClientRect();
      return {gap:number.x-left.right,expected:parseFloat(getComputedStyle(el).marginInlineStart)};
    }));
    assert.equal(gaps.length,4);
    for(const g of gaps){assert(g.gap>=3&&g.gap<=9,'Visible math spacing after =');close(g.gap,g.expected,.15);}
    assert(!(await page.locator('#trajectory-equations').innerHTML()).includes('x_0=y_0=4'),'Old origin constants are removed');
  };
  const plotPoint=async(x,y)=>{
    await page.locator('#viewport').scrollIntoViewIfNeeded();
    const [left,top,w,h]=(await scene()).plot,b=await page.locator('canvas').boundingBox();
    return {x:b.x+left+x*w/8,y:b.y+top+h-y*h/8};
  };
  const place=async(x,y)=>{await mode(true);const p=await plotPoint(x,y);await page.mouse.click(p.x,p.y);};
  const sameMotion=(before,after)=>{
    assert.deepEqual(after.particle,before.particle,'Origin changes do not move the particle');
    for(const color of ['#89939d','#268576'])assert.deepEqual(after.strokes.filter(s=>s.color===color),before.strokes.filter(s=>s.color===color),'Trail and osculating geometry stay fixed');
    assert.deepEqual(after.arrows.filter(s=>s.color!=='#d9683b'),before.arrows.filter(s=>s.color!=='#d9683b'),'Velocity and acceleration arrows stay fixed');
  };
  const keys=await page.locator('#trajectory-select option').evaluateAll(els=>els.map(el=>el.value));
  for(const key of keys){
    await reset();await page.locator('#trajectory-select').selectOption(key);
    const max=Number(await page.locator('#time-slider').getAttribute('max'));await seek(max*.27);
    const before=await scene(),values=await read(),t=await page.locator('#time-slider').inputValue();
    await place(1.25,2.5);
    const after=await scene(),translated=await read(),o=await origin();
    close(o.x,1.25);close(o.y,2.5);
    await checkEquations(key,o);
    close(translated[0]['component-x'],values[0]['component-x']-o.x);
    close(translated[0]['component-y'],values[0]['component-y']-o.y);
    assert.deepEqual(translated.slice(1),values.slice(1),'All derivatives remain unchanged');
    assert.equal(await page.locator('#time-slider').inputValue(),t);
    assert.equal(await page.locator('#play-button').innerText(),'Lire');
    sameMotion(before,after);
    const [left,top,w,h]=after.plot,ox=left+o.x*w/8,oy=top+h-o.y*h/8;
    for(const axis of ['x','y']){
      const ticks=await page.locator('#axis-ticks-'+axis+' .axis-tick-label').evaluateAll(els=>els.map(el=>({value:Number(el.querySelector('[data-value]').dataset.value),x:parseFloat(el.style.left),y:parseFloat(el.style.top)})));
      assert(ticks.some(t=>t.value<0),'Negative coordinates appear after translating the origin');
      for(const tick of ticks){
        if(axis==='x')close(tick.x,left+(tick.value+o.x)*w/8);
        else close(tick.y,top+h-(tick.value+o.y)*h/8);
      }
    }
    const positionArrow=after.arrows.find(a=>a.color==='#d9683b');assert(positionArrow);
    const vertices=positionArrow.path;
    close((vertices[0][0]+vertices.at(-1)[0])/2,ox);close((vertices[0][1]+vertices.at(-1)[1])/2,oy);
    close(vertices[3][0],after.particle[0]);close(vertices[3][1],after.particle[1]);
    const projections=after.strokes.filter(s=>s.color==='#d9683b'&&Math.abs(s.width-1.15)<1e-5);
    assert.equal(projections.length,2);close(projections[0].path[1][1],oy);close(projections[1].path[1][0],ox);
    assert.equal(await page.locator('#origin-transform').isVisible(),true);
    await page.waitForFunction(()=>!document.querySelector('#trajectory-equations').textContent.includes('\\('));
    assert.equal(await page.locator('[data-mml-node="merror"]').count(),0);
    assert(await page.locator('#trajectory-equations').textContent().then(s=>s.includes('x')),'Equations use the chosen coordinates x,y');
  }
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await reset();await mode(true);
    await page.locator('#trajectory-select').selectOption('lissajous2');await seek(2);
    const original=await scene();
    // Drag the actual O handle: grabbing anywhere in its target does not jump.
    const end=await plotPoint(3,3),handle=await page.locator('#origin-handle').boundingBox();
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);
    const equationSvg=await page.locator('#trajectory-equations .tex-math mjx-container').first().elementHandle();
    const panelHeight=await page.locator('.equation-section').evaluate(el=>el.getBoundingClientRect().height);
    const canvasTop=await page.locator('canvas').evaluate(el=>el.getBoundingClientRect().top);
    await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:12});
    await checkEquations('lissajous2',await origin());
    assert(await equationSvg.evaluate(el=>el.isConnected),'Equations are not rebuilt during dragging');
    close(await page.locator('.equation-section').evaluate(el=>el.getBoundingClientRect().height),panelHeight,.1);
    close(await page.locator('canvas').evaluate(el=>el.getBoundingClientRect().top),canvasTop,.1);
    await page.mouse.up();
    close((await origin()).x,3);close((await origin()).y,3);sameMotion(original,await scene());
    await mode(false);
    assert(await page.locator('#origin-handle').isVisible(),'Moved origin remains directly draggable');
    if(process.env.SCREENSHOT_DIR){
      await page.locator('#viewport').screenshot({path:path.join(process.env.SCREENSHOT_DIR,`2d-origin-${width}.png`)});
      await page.locator('.equation-section').screenshot({path:path.join(process.env.SCREENSHOT_DIR,`2d-origin-equations-${width}.png`)});
    }
    const values=await read(),start=await plotPoint(5,1);
    await page.mouse.move(start.x,start.y);await page.mouse.down();
    await page.mouse.move(start.x+20,start.y-15,{steps:4});await page.mouse.up();
    assert.deepEqual(await read(),values,'Panning does not change the chosen reference frame');
    close((await origin()).x,3);close((await origin()).y,3);
    // Reset framing must not silently reset the coordinate origin.
    await page.locator('#reset-view').click();close((await origin()).x,3);close((await origin()).y,3);
    const saved=await scene();await reset();sameMotion(saved,await scene());
    assert(await page.locator('#origin-handle').isHidden());
    assert(await page.locator('#origin-transform').isVisible(),'Reference panel keeps its size even at the initial origin');
    close((await origin()).x,0);close((await origin()).y,0);
    await checkEquations('lissajous2',{x:0,y:0});
    // Accessible fine adjustment; cancelling a touch drag releases capture.
    await mode(true);await page.locator('#origin-handle').focus();await page.keyboard.press('ArrowRight');
    close((await origin()).x,.1);
    const p=await plotPoint(4,4),q=await plotPoint(2,3),cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:q.x,y:q.y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    close((await origin()).x,2);close((await origin()).y,3);
    await cdp.detach();await place(1,1);close((await origin()).x,1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.locator('#trajectory-select').selectOption('lissajous2');await seek(0);
  await place(6,4);close((await read())[0].magnitude,0);
  assert(!(await scene()).arrows.some(a=>a.color==='#d9683b'),'Position arrow vanishes when the origin equals the particle');
  // Dragging/repositioning while running must not stop or restart playback.
  await page.locator('#play-button').click();const t=Number(await page.locator('#time-slider').inputValue());
  await place(2,2);assert.equal(await page.locator('#play-button').innerText(),'Pause');
  assert(Number(await page.locator('#time-slider').inputValue())>t);
  await page.locator('#play-button').click();await reset();await mode(false);
  assert.deepEqual(errors,[]);
  console.log('PASS: movable origin on all 17 trajectories; unchanged motion/derivatives, translated axes, vectors, projections, equations, mouse/touch, mobile and playback.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
