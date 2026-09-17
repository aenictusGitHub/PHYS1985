'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const root = path.join(__dirname, '..');
const zip = path.join(root, 'cinematique_3d_webapp_fr.zip');
const entry = execFileSync('unzip', ['-Z1', zip], {encoding:'utf8'}).split('\n').find(p => /^[^/]+\/app\.js$/.test(p));
const source = execFileSync('unzip', ['-p', zip, entry], {encoding:'utf8'});
assert(fs.readFileSync(path.join(root, 'cinematique_3d_webapp_fr.html'), 'utf8').includes(source));
const fn = name => {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, name);
  return source.slice(start, source.indexOf('\n  }\n', start) + 5) + '\n';
};
let pure = source.slice(0, source.indexOf("  const viewport = document.getElementById('viewport');"));
pure += source.match(/  const camera = \{[\s\S]*?\n  \};/)[0] + '\n';
pure += 'let viewportWidth=900,viewportHeight=650;\n';
pure += 'const gridTrajectoryBoundsCache = new WeakMap();\n';
pure += source.match(/  const trajectoryTimeMax = .*;/)[0]+'\n';
pure += source.slice(source.indexOf('  const axisTickValues ='), source.indexOf('  const vectorSelection ='));
for (const name of ['cameraBasis', 'projectWorld', 'gridTrajectoryBounds', 'gridDepthAxis', 'enclosingGridRanges', 'spaceGridSegments', 'projectGridSegment']) pure += fn(name);
pure += 'return {camera,V,TRAJECTORIES,toScene,trajectoryTimeMax,cameraBasis,projectWorld,currentAxisRanges,enclosingGridRanges,spaceGridSegments,projectGridSegment,resize(w,h){viewportWidth=w;viewportHeight=h;}};})();';
const app = vm.runInNewContext(pure), {camera,V} = app;
assert.equal(app.spaceGridSegments(app.cameraBasis(), app.currentAxisRanges()).length, 24);
for (const [yaw,pitch,normal] of [[0,0,'z'],[-Math.PI/2,0,'x'],[0,Math.PI/2,'y']]) {
  Object.assign(camera,{yaw,pitch});
  const segments = app.spaceGridSegments(app.cameraBasis(), app.currentAxisRanges());
  assert.equal(segments.length,4,'Only one plane in aligned views (excluding its two axes)');
  assert(segments.flat().every(p => p[normal] === 0));
}
let cases = 0;
for (const [width,height] of [[900,650],[370,620]]) for (const distance of [5200,13800,26000])
for (const target of [V(2000,2000,2000),V(-5000,1000,7000)]) for (let i=0;i<24;i++)
for (const pitch of [-Math.PI/2,-.6,0,.6,Math.PI/2]) {
  app.resize(width,height); Object.assign(camera,{distance,target,yaw:i*Math.PI/12,pitch});
  const basis=app.cameraBasis(), ranges=app.enclosingGridRanges(basis,app.TRAJECTORIES.lissajous);
  const segments=app.spaceGridSegments(basis,ranges), keys=new Set();
  assert(segments.length <= 400,'Bounded mesh size even at maximum zoom-out and pan');
  for (const [a,b] of segments) {
    assert.equal(['x','y','z'].filter(axis => a[axis] !== b[axis]).length,1,'Axis-aligned mesh');
    for (const p of [a,b]) for (const value of Object.values(p))
      assert(Math.abs(value/2000-Math.round(value/2000))<1e-9,'Each mesh coordinate matches a 1 m tick');
    const key=JSON.stringify([a,b]); assert(!keys.has(key),'No duplicate line'); keys.add(key);
    const projected=app.projectGridSegment(a,b,basis);
    if (projected) for (const p of projected) {
      assert(Number.isFinite(p.x)&&Number.isFinite(p.y));
      assert(p.x>=16-1e-6&&p.x<=width-16+1e-6&&p.y>=16-1e-6&&p.y<=height-16+1e-6,'Near-plane and screen clipping');
    }
  }
  cases++;
}
assert(source.indexOf('    drawSpaceGrid(basis);')<source.indexOf('    drawTrail(item, basis);'),'Mesh stays behind the trajectory');
console.log('PASS: 1 m grid geometry, aligned planes, uniqueness and '+cases+' camera/zoom/clipping cases.');

function convexHull(points) {
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y);
  const half=values=>{
    const result=[];
    for(const p of values){while(result.length>1&&cross(result.at(-2),result.at(-1),p)<=0)result.pop();result.push(p);}
    return result.slice(0,-1);
  };
  return half(sorted).concat(half(sorted.slice().reverse()));
}
function contained(hull,p) {
  return hull.every((a,i)=>{
    const b=hull[(i+1)%hull.length];
    return (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)>=-1e-4;
  });
}
let envelopes=0;
app.resize(900,650);
for (const distance of [5200,13800,26000]) for (const [yaw,pitch] of [[.78,.48],[0,0],[-Math.PI/2,0],[0,Math.PI/2],[.78,Math.PI/2]])
for (const [key,item] of Object.entries(app.TRAJECTORIES)) {
  Object.assign(camera,{distance,target:V(2000,2000,2000),yaw,pitch});
  const basis=app.cameraBasis(),ranges=app.enclosingGridRanges(basis,item);
  // Lines coinciding with axes are omitted from the mesh; the common origin
  // still forms the corner of its outline, completed by the two axes.
  const hull=convexHull([...app.spaceGridSegments(basis,ranges).flat(),V()].map(p=>app.projectWorld(p,basis)).filter(Boolean));
  for(let i=0;i<=2048;i++){
    const p=app.projectWorld(app.toScene(item.position(app.trajectoryTimeMax(item)*(i+.37)/2049)),basis);
    if(p)assert(contained(hull,p),'Entire projected '+key+' fits the grid, including perspective at '+yaw+'/'+pitch+'/'+distance);
  }
  envelopes++;
}
console.log('PASS: full trajectory inside projected grid for all 17 curves, five views and three zoom levels ('+envelopes+' envelopes).');

if (process.argv.includes('--pure')) process.exit(0);
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      Object.defineProperty(navigator,'webdriver',{get:()=>false});
      const proto=CanvasRenderingContext2D.prototype;
      for (const method of ['clearRect','beginPath','moveTo','lineTo','stroke']) {
        const original=proto[method];
        proto[method]=function(...args){
          if(method==='clearRect'){window.__gridPaths=[];window.__trailPaths=[];window.__axisPaths=[];}
          if(method==='beginPath') this.__testPath=[];
          if(method==='moveTo'||method==='lineTo') (this.__testPath??=[]).push(args.slice(0,2));
          if(method==='stroke'&&this.strokeStyle==='#aebdcd') window.__gridPaths.push(this.__testPath.slice());
          if(method==='stroke'&&this.strokeStyle==='#52627a'&&Math.abs(this.lineWidth-1.8)<.001) window.__axisPaths.push(this.__testPath.slice());
          if(method==='stroke'&&this.strokeStyle==='#89939d') window.__trailPaths.push(this.__testPath.slice());
          return original.apply(this,args);
        };
      }
    });
    await page.goto(pathToFileURL(path.join(root,'cinematique_3d_webapp_fr.html')).href);
    await page.waitForFunction(()=>!document.getElementById('loading-message'));
    await page.locator('#play-button').click();
    const grid=page.getByRole('checkbox',{name:'Quadrillage de l’espace'});
    assert(!await grid.isChecked());
    assert.equal(await page.evaluate(()=>window.__gridPaths.length),0);
    const state=async()=>page.evaluate(()=>({
      time:document.getElementById('time-slider').value,
      play:document.getElementById('play-button').textContent,
      readouts:document.getElementById('vector-readouts').textContent,
    }));
    for (const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});
      await page.locator('#time-slider').evaluate(el=>{el.value=el.max;el.dispatchEvent(new Event('input',{bubbles:true}));});
      for(const id of ['reset-view','front-view','side-view','top-view']) {
        await page.locator('#'+id).click();
        await grid.uncheck();
        await page.waitForFunction(()=>window.__gridPaths.length===0);
        const before=await state();
        await grid.check();
        await page.waitForFunction(()=>window.__gridPaths.length===1&&window.__gridPaths[0].length>0);
        assert.deepEqual(await state(),before,'Display option does not alter time, physics or playback');
        const geometry=await page.evaluate(()=>({grid:window.__gridPaths.flat(),trail:window.__trailPaths.flat(),axes:window.__axisPaths.flat()}));
        assert(geometry.trail.length>100,'Test the whole completed trajectory, not only its beginning');
        const hull=convexHull([...geometry.grid,...geometry.axes].map(([x,y])=>({x,y})));
        for(const [x,y] of geometry.trail)assert(contained(hull,{x,y}),'Full rendered trail fits inside grid in '+id+'/'+width);
        const labels=await page.locator('.axis-title-label').evaluateAll(els=>els.map(el=>el.style.cssText));
        await page.locator('#time-slider').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
        assert.deepEqual(await page.evaluate(()=>window.__gridPaths.flat()),geometry.grid,'Grid fixed throughout playback');
        assert.deepEqual(await page.locator('.axis-title-label').evaluateAll(els=>els.map(el=>el.style.cssText)),labels,'Axis labels fixed throughout playback');
        await page.locator('#time-slider').evaluate(el=>{el.value=el.max;el.dispatchEvent(new Event('input',{bubbles:true}));});
        assert(!await page.locator('#projection-toggle').isChecked(),'Independent from particle projections');
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        assert.equal(await page.locator('[data-mml-node="merror"]').count(),0);
        if(process.env.SCREENSHOT_DIR) await page.locator('#viewport').screenshot({path:path.join(process.env.SCREENSHOT_DIR,`grid-${id}-${width}.png`)});
      }
      await grid.focus(); await page.keyboard.press('Space');
      assert(!await grid.isChecked(),'Keyboard toggle');
      await page.waitForFunction(()=>window.__gridPaths.length===0);
      await page.keyboard.press('Space'); assert(await grid.isChecked());
      await page.locator('#trajectory-select').selectOption('ballistic');
      assert(await grid.isChecked(),'Option survives a trajectory change');
      await page.locator('#trajectory-select').selectOption('lissajous');
    }
    const before=Number(await page.locator('#time-slider').inputValue());
    await page.locator('#play-button').click();
    await grid.uncheck(); await grid.check();
    assert.equal(await page.locator('#play-button').innerText(),'Pause');
    await page.waitForFunction(t=>Number(document.getElementById('time-slider').value)>t+.1,before);
    await page.locator('#play-button').click();
    assert.deepEqual(errors,[]);
    console.log('PASS: grid off by default, live toggle, four views, desktop/mobile, keyboard, persistent choice and unchanged physics/playback.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
