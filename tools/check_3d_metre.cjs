'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..');
function load(zip){
  const entry=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).split('\n').find(p=>/^[^/]+\/app\.js$/.test(p));
  const source=execFileSync('unzip',['-p',zip,entry],{encoding:'utf8'});
  const pure=source.slice(0,source.indexOf("  const viewport = document.getElementById('viewport');"));
  const api=vm.runInNewContext(pure+'\nreturn {PARAMETERS,TRAJECTORIES,derivatives,osculatingGeometry,toWorld,scene:typeof toScene === "function" ? toScene : toWorld, tick:AXIS_TICK_STEP};})();');
  return {source,api};
}
const {source,api}=load(path.join(root,'cinematique_3d_webapp_fr.zip'));
assert(fs.readFileSync(path.join(root,'cinematique_3d_webapp_fr.html'),'utf8').includes(source));
assert.equal(api.PARAMETERS.R,1);assert.equal(api.tick,1);
for(const axis of ['x0','y0','z0'])assert.equal(api.PARAMETERS[axis],1);
const close=(a,b,tol=1e-6)=>assert(Math.abs(a-b)<=tol,`${a} != ${b}`);
for(const item of Object.values(api.TRAJECTORIES))for(let i=0;i<=96;i++){
  const data=api.derivatives(item,item.duration*i/96);
  for(const field of ['position','velocity','acceleration','jerk','tangential','normal'])
    assert(Object.values(data[field]).every(Number.isFinite));
  assert(Object.values(data.position).every(v=>v>=-.3&&v<=2.3),'All trajectories use metre-scale positions');
}
const circle=api.osculatingGeometry(api.derivatives(api.TRAJECTORIES.mcua,2));
assert(circle.defined);close(circle.radius,1,1e-5);
const ballistic=api.TRAJECTORIES.ballistic;
close(ballistic.duration,10*Math.PI/Math.sqrt(2000));
const launch=api.derivatives(ballistic,0);
close(launch.speed,Math.sqrt(20));close(launch.acceleration.y,-9.81,1e-7);
close(launch.position.z,1);assert.equal(Math.hypot(...Object.values(launch.jerk)),0);
assert(ballistic.parameters.some(p=>p.includes('g=9.81')));
assert(Object.values(api.TRAJECTORIES).every(item=>item.parameters.every(p=>!p.includes('2000'))));
if(process.env.REFERENCE_3D_ZIP){
  const previous=load(process.env.REFERENCE_3D_ZIP).api;
  for(const [key,item] of Object.entries(api.TRAJECTORIES)){
    const old=previous.TRAJECTORIES[key],timeScale=key==='ballistic'?1/Math.sqrt(2000):1;
    close(item.duration,old.duration*timeScale);
    close(item.scaleV,old.scaleV*timeScale);close(item.scaleA,old.scaleA*timeScale**2);
    for(let i=0;i<=64;i++){
      const time=old.duration*i/64,before=previous.derivatives(old,time),after=api.derivatives(item,time*timeScale);
      for(const [field,order] of [['position',0],['velocity',1],['acceleration',2],['jerk',3]])
        for(const axis of ['x','y','z'])close(after[field][axis],before[field][axis]/2000/timeScale**order,order>=2?1e-5:2e-6);
      const p=api.scene(after.position),q=previous.scene(before.position);
      for(const axis of ['x','y','z'])close(p[axis],q[axis],1e-8);
      const c=api.osculatingGeometry(after),d=previous.osculatingGeometry(before);
      assert.equal(c.defined,d.defined,key+' curvature existence');
      if(c.defined)close(c.radius,d.radius/2000,Math.max(2e-4,c.radius*1e-4));
    }
  }
}
console.log('PASS: 17 metre-scale trajectories, SI derivatives, 1 m circle, physical gravity and unchanged projected geometry.');
