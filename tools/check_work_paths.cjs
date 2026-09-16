/* Numerical checks of the packaged imposed-path experiment and free-mode regression. */
'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'), zip=path.join(root,'puissance_travail_webapp_fr.zip');
const read=name=>execFileSync('unzip',['-p',zip,'*/'+name],{encoding:'utf8'});
const app=read('app.js'),physics=read('physics.js'),html=read('index.html');
const field=app.slice(app.indexOf('  function forceAt('),app.indexOf('  function fieldReferenceMagnitude('));
const free=app.slice(app.indexOf('  function derivative('),app.indexOf('  function sampleSimulation('));
const api=vm.runInNewContext(physics+'\nconst PI=Math.PI, ROTATING_FIELD_OMEGA=2*PI/10;\n'+field+free+'\n({M:ImposedWork,forceAt,integrate})');
const near=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
const {M,forceAt}=api;
const p={a:[Math.PI-1.5,1.5*Math.PI-.4],b:[Math.PI+2,1.5*Math.PI+.6],bend:1.3,fieldId:'vortex',forceScale:1,mass:1};
const d=M.build(p,forceAt);assert(Math.abs(d.difference)>1,'Default example must clearly demonstrate path dependence');
// The second path is an S, not a mirrored copy of the first arc. Check its
// opposite lobes, the shared midpoint chord, and the exact velocity derivative.
for(const [a,b] of [[[0,0],[4,0]],[[4,0],[0,0]],[[0,0],[0,4]],[[1,-2],[-3,4]]]){
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),n=[-dy/len,dx/len];
  const offset=(k,u)=>{const q=M.point(a,b,1,k,u),s=u*u*(3-2*u);return q.r.reduce((sum,x,j)=>sum+(x-a[j]-s*(b[j]-a[j]))*n[j],0);};
  assert(offset(0,.25)*offset(0,.75)>0,'Arc stays on one side');
  assert(offset(1,.25)*offset(1,.75)<0,'S changes side');near(offset(1,.5),0);
  for(const k of [0,1])for(const u of [.1,.25,.5,.75,.9]){
    const q=M.point(a,b,1,k,u),prev=M.point(a,b,1,k,u-1e-6),next=M.point(a,b,1,k,u+1e-6),swapped=M.point(b,a,1,k,1-u);
    for(let j=0;j<2;j++){near(q.d[j],(next.r[j]-prev.r[j])/2e-6,3e-6);near(q.r[j],swapped.r[j]);near(q.d[j],-swapped.d[j]);}
  }
}
for(const id of M.stationary)for(const bend of [0,.2,1.3,2.5])for(const amplitude of [.2,1,2]){
  const c={...p,fieldId:id,bend,forceScale:amplitude},d=M.build(c,forceAt);
  for(let k=0;k<2;k++){
    near(d.sample(k,0).work,0);near(d.sample(k,1).work,d.routes[k].total);
    for(let j=0;j<2;j++){near(d.sample(k,0).r[j],c.a[j]);near(d.sample(k,1).r[j],c.b[j]);near(d.sample(k,0).d[j],0);near(d.sample(k,1).d[j],0);}
  }
  near(d.loop(0).work,0);near(d.loop(.5).work,d.routes[0].total);near(d.loop(1).work,d.difference);
  near(d.loop(1,true).work,-d.difference);
  for(const reverse of [false,true])for(const q of [0,.5,1])for(const v of d.loop(q,reverse).d)near(v,0);
  const swapped=M.build({...c,a:c.b,b:c.a},forceAt);
  near(swapped.routes[0].total,-d.routes[0].total);near(swapped.routes[1].total,-d.routes[1].total);
  if(bend===0)near(d.difference,0);
  if(M.conservative(id)){
    for(const r of d.routes)near(r.total,d.expected,2e-7);
    near(d.difference,0,3e-7);
  }
  // Independent midpoint integral, not the Simpson implementation under test.
  for(let k=0;k<2;k++){
    let independent=0;const n=20000;
    for(let i=0;i<n;i++){const q=M.point(c.a,c.b,bend,k,(i+.5)/n),f=forceAt(...q.r,0,c);independent+=(f.x*q.d[0]+f.y*q.d[1])/n;}
    near(independent,d.routes[k].total,2e-6);
  }
}
for(const id of ['central','periodic','gravity'])for(let j=0;j<15;j++){
  const c={...p,fieldId:id,a:[Math.sin(j)*7,Math.cos(j)*6],b:[Math.cos(j+.8)*8,Math.sin(j+.8)*5],bend:2.5};
  const d=M.build(c,forceAt);for(const r of d.routes)near(r.total,d.expected,2e-6);
}
assert.throws(()=>M.build({...p,fieldId:'rotating'},forceAt));assert.throws(()=>M.build({...p,b:p.a},forceAt));
// Two independent quadratures of the same work: P dt versus F dot dr.
let maxIntegralError=0;
for(const id of M.stationary)for(const bend of [0,1.3,2.5])for(const route of [0,1,'loop'])for(const reverse of [false,true]){
  const c={...p,fieldId:id,bend,forceScale:2},reference=M.build(c,forceAt);
  const model=M.compareIntegrals(c,forceAt,route,10,reverse);
  const expected=q=>route==='loop'?reference.loop(q,reverse).work:reference.sample(route,q).work;
  let lastLength=-1;
  for(const q of [0,.000001,.073,.25,.4999,.5,.5001,.797,1]){
    const s=model.sample(q);assert(Object.values(s).flat().every(Number.isFinite));
    near(s.timeWork,expected(q),1e-7);near(s.timeWork,s.spaceWork,2e-4);
    assert(s.length>=lastLength,'Arc length must increase even on the return leg');lastLength=s.length;
    maxIntegralError=Math.max(maxIntegralError,Math.abs(s.error));
    if(id==='gravity')near(s.spaceWork,-c.mass*c.forceScale*(s.r[1]-c.a[1]),1e-10);
  }
  near(model.sample(0).timeWork,0);near(model.sample(0).spaceWork,0);near(model.sample(0).power,0);near(model.sample(1).power,0);
  if(route==='loop')near(model.sample(.5).power,0);
  for(const duration of [2,20]){
    const alternate=M.compareIntegrals(c,forceAt,route,duration,reverse);
    for(const q of [.27,.5,1]){
      const a=model.sample(q),b=alternate.sample(q);
      near(a.spaceWork,b.spaceWork,1e-12);near(a.timeWork,b.timeWork,1e-10);near(a.power*10,b.power*duration,1e-10);
    }
  }
}
const coarse=M.compareIntegrals(p,forceAt,0,10,false,1200,24),fine=M.compareIntegrals(p,forceAt,0,10);
assert(Math.abs(coarse.sample(1).error)>Math.abs(fine.sample(1).error)*100,'Spatial refinement converges independently of temporal quadrature');
const sCurve=M.compareIntegrals(p,forceAt,1,10);
assert(sCurve.timePoints.some(p=>p.y>0)&&sCurve.timePoints.some(p=>p.y<0));
assert(sCurve.spacePoints.some(p=>p.y>0)&&sCurve.spacePoints.some(p=>p.y<0),'Signed force, never its magnitude');
assert.throws(()=>M.compareIntegrals({...p,fieldId:'rotating'},forceAt));
console.log('PASS: temporal/spatial quadrature, partial paths, signed areas, stops, duration invariance, convergence. Max tested discrepancy: '+maxIntegralError+' J.');
// Duration only changes the time parametrization and velocity, never the integral.
for(const duration of [2,10,20])near(M.build({...p,duration},forceAt).difference,d.difference);
const sim=api.integrate({fieldId:'cellular',mass:20,forceScale:1,x0:4.4,y0:6.8,speed0:Math.SQRT2*.2,angle0:-45,duration:15*Math.PI});
near(sim.work[sim.count],1.30696085,8e-4);near(sim.work[sim.count],sim.kinetic[sim.count]-sim.initialKinetic,8e-5);
for(const id of ['motion-mode','free-controls','free-visualization','path-controls','path-visualization','path-play','path-time','path-field'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
const standalone=fs.readFileSync(path.join(root,'puissance_travail_webapp_fr.html'),'utf8');assert(standalone.includes(app));assert(standalone.includes(physics));
console.log('PASS: stationary fields, potential differences, independent quadrature, closed/reversed contours, equal paths, time independence, endpoints and free-motion regression.');
console.log('Default vortex: W1='+d.routes[0].total.toFixed(6)+' J, W2='+d.routes[1].total.toFixed(6)+' J, circulation='+d.difference.toFixed(6)+' J.');
