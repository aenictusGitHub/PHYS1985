'use strict';
const assert = require('node:assert/strict'), path = require('node:path'), vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const {chromium, webkit, firefox} = require('playwright');
const root = path.join(__dirname, '..');
const app = execFileSync('unzip', ['-p', path.join(root, 'puissance_travail_webapp_fr.zip'), '*/app.js'], {encoding:'utf8'});
const integrate = vm.runInNewContext('const PI=Math.PI, ROTATING_FIELD_OMEGA=2*PI/10;\n'
  + app.slice(app.indexOf('  function forceAt('), app.indexOf('  function fieldReferenceMagnitude('))
  + app.slice(app.indexOf('  function derivative('), app.indexOf('  function sampleSimulation(')) + '\nintegrate');
const near = (a,b,tol=1e-7) => assert(Math.abs(a-b)<tol, `${a} != ${b}`);
const input = (page,id,value) => page.locator('#'+id).evaluate((el,value) => {
  el.value=String(value); el.dispatchEvent(new Event('input',{bubbles:true}));
},value);
const frames = page => page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function checkPlot(page, simulation, time, duration) {
  const plot = await page.evaluate(()=>{
    const canvas=document.getElementById('kinetic-canvas'),r=canvas.getBoundingClientRect();
    return {width:Math.round(r.width),height:Math.round(r.height),draw:window.__kineticDrawing,
      energy:Number(document.getElementById('kinetic-result-digits').dataset.value),
      sceneEnergy:Number(document.getElementById('scene-kinetic-digits').dataset.value),
      units:[...document.querySelectorAll('[data-kinetic-unit]')].filter(e=>!e.hidden).map(e=>Number(e.dataset.kineticUnit)),
      ticks:[...document.querySelectorAll('#kinetic-ticks .x-tick')].map(e=>[e.style.left,e.textContent]),
      powerTicks:[...document.querySelectorAll('#chart-ticks .x-tick')].map(e=>[e.style.left,e.textContent])};
  });
  assert.deepEqual(plot.ticks,plot.powerTicks,'same time axis and tick positions');
  const left=plot.width<430?52:66, w=plot.width-left-24, h=plot.height-54-48;
  const limit=Math.max(.05,simulation.maxKinetic*1.15);
  const xMap=t=>left+t/duration*w, yMap=k=>54+(1-k/limit)*h;
  const q=Math.min(simulation.count,time/simulation.dt),lo=Math.min(simulation.count-1,Math.floor(q));
  const k=simulation.kinetic[lo]+(q-lo)*(simulation.kinetic[lo+1]-simulation.kinetic[lo]);
  near(plot.energy,k,.00051); near(plot.energy,plot.sceneEnergy);
  assert.deepEqual(plot.units,[limit>=1e6?1e6:limit>=1e3?1e3:1]);
  const current=plot.draw.dots.find(d=>d.color==='#ce622e');
  assert(current,'orange current-time marker is drawn');
  near(current.arc[0],xMap(time)); near(current.arc[1],yMap(k));
  const progress=plot.draw.paths.find(p=>p.color==='#ce622e');
  assert(progress,'elapsed kinetic curve is drawn');
  const end=progress.points.at(-1); near(end[0],xMap(time)); near(end[1],yMap(k));
  const full=plot.draw.paths.find(p=>p.color.startsWith('rgba(206, 98, 46'));
  assert(full,'full kinetic curve is drawn faintly');
  near(full.points.at(-1)[0],xMap(duration));
  near(full.points.at(-1)[1],yMap(simulation.kinetic[simulation.count]));
  for(const point of full.points){
    const t=(point[0]-left)/w*duration, i=Math.round(t/simulation.dt);
    near(point[1],yMap(simulation.kinetic[i]));
    assert(point.every(Number.isFinite));
  }
  const reference=plot.draw.paths.find(p=>p.color==='#7c8998');
  near(reference.points[0][1],yMap(simulation.initialKinetic));
  assert.deepEqual(reference.dash,[5,4]);
}
(async()=>{
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit],['firefox',firefox]]){
    const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
    try{for(const lang of ['fr','en']){
      const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{
        const p=CanvasRenderingContext2D.prototype;
        for(const method of ['fillRect','beginPath','moveTo','lineTo','arc','stroke','fill']){
          const original=p[method];
          p[method]=function(...args){
            if(this.canvas.id==='kinetic-canvas'){
              if(method==='fillRect') window.__kineticDrawing={paths:[],dots:[]};
              if(method==='beginPath'){this.__points=[];this.__arc=null;}
              if(method==='moveTo'||method==='lineTo')this.__points.push(args.slice(0,2));
              if(method==='arc')this.__arc=args.slice(0,3);
              if(method==='stroke')window.__kineticDrawing.paths.push({color:this.strokeStyle,points:[...this.__points],dash:this.getLineDash()});
              if(method==='fill'&&this.__arc)window.__kineticDrawing.dots.push({color:this.fillStyle,arc:this.__arc});
            }
            return original.apply(this,args);
          };
        }
      });
      await page.goto(pathToFileURL(path.join(root,'puissance_travail_webapp_fr.html')).href+'?lang='+lang);
      await page.waitForFunction(()=>window.PhysShare?.ready);
      assert.equal(await page.locator('#kinetic-chart-title').textContent(),lang==='fr'?'Énergie cinétique':'Kinetic energy');
      assert.equal(await page.locator('#initial-velocity-readout > span').textContent(),lang==='fr'?'Vitesse initiale':'Initial velocity');
      for(const field of ['cellular','periodic','central','vortex','rotating','traveling','gravity']){
        await page.selectOption('#force-field-select',field);
        await input(page,'duration-slider',100);
        const p=await page.evaluate(()=>PhysShare.capture().data.parameters),simulation=integrate(p);
        if(field==='gravity'){
          const vx=p.speed0*Math.cos(p.angle0*Math.PI/180),vy=p.speed0*Math.sin(p.angle0*Math.PI/180)-p.forceScale*100;
          near(simulation.kinetic.at(-1),.5*p.mass*(vx*vx+vy*vy),.0001);
        }
        for(const t of [0,12.34,100]){await input(page,'time-slider',t);await checkPlot(page,simulation,t,100);}
        assert(await page.locator('#final-work-area').isVisible(),'final work explanation remains');
      }
      // Exact rest and uniform motion are horizontal curves, never invalid ranges.
      for(const speed0 of [0,.5]){
        await page.evaluate(async speed0=>{
          const s=PhysShare.capture();Object.assign(s.data.parameters,{fieldId:'gravity',forceScale:0,mass:2,speed0});
          s.data.time=0;await PhysShare.restore(s);
        },speed0);
        const simulation=integrate(await page.evaluate(()=>PhysShare.capture().data.parameters));
        await checkPlot(page,simulation,0,100);
      }
      await page.selectOption('#scenario-select','positive');await input(page,'time-slider',10);
      const shared=await browser.newPage();
      await shared.goto(await page.evaluate(()=>PhysShare.makeLink()));await shared.waitForFunction(()=>PhysShare.ready);
      assert.equal(await shared.locator('#kinetic-result-digits').getAttribute('data-value'),await page.locator('#kinetic-result-digits').getAttribute('data-value'));
      await shared.close();
      for(const mode of ['paths','integrals']){
        await page.selectOption('#motion-mode',mode);assert(await page.locator('#kinetic-card').isHidden());
      }
      await page.selectOption('#motion-mode','free');assert(await page.locator('#kinetic-card').isVisible());
      await page.click('#reset-button');await page.click('#play-button');
      await page.waitForFunction(()=>Number(document.getElementById('time-slider').value)>.2);
      await page.click('#play-button');
      near(Number(await page.locator('#kinetic-result-digits').getAttribute('data-value')),Number(await page.locator('#scene-kinetic-digits').getAttribute('data-value')));
      for(const width of [1440,1024,768,390,320]){
        await page.setViewportSize({width,height:1000});await frames(page);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        assert.equal(await page.locator('mjx-merror,[data-mml-node="merror"]').count(),0);
        assert(await page.locator('#kinetic-canvas').evaluate(e=>e.clientHeight>=180));
        const s=await page.evaluate(()=>PhysShare.capture().data);
        await checkPlot(page,integrate(s.parameters),s.time,s.parameters.duration);
      }
      if(name==='chromium'&&lang==='fr'){
        for(const width of [1440,919]){
          await page.setViewportSize({width,height:1000});await frames(page);
          await page.locator(width===1440?'#free-visualization .experiment-grid':'#kinetic-card').screenshot({path:'/private/tmp/work-kinetic-'+width+'.png'});
        }
      }
      assert.deepEqual(errors,[]);await page.close();
      console.log('PASS kinetic chart',name,lang,'all fields, 100 s, canvas values, zero/constant energy, playback, sharing and responsive layout');
    }}finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
