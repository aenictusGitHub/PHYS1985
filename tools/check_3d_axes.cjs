'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),zip=path.join(root,'cinematique_3d_webapp_fr.zip');
const entry=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).split('\n').find(p=>/^[^/]+\/app\.js$/.test(p));
const source=execFileSync('unzip',['-p',zip,entry],{encoding:'utf8'});
assert(fs.readFileSync(path.join(root,'cinematique_3d_webapp_fr.html'),'utf8').includes(source));
const fn=name=>{const start=source.indexOf('  function '+name+'(');assert(start>=0,name);return source.slice(start,source.indexOf('\n  }\n',start)+5)+'\n';};
let pure=source.slice(0,source.indexOf("  const viewport = document.getElementById('viewport');"));
pure+=source.match(/  const camera = \{[\s\S]*?\n  \};/)[0]+'\n';
pure+='let viewportWidth=900,viewportHeight=650;\n';
pure+=source.slice(source.indexOf('  const axisTickValues ='),source.indexOf('  const vectorSelection ='));
for(const name of ['cameraBasis','projectWorld','referenceAxes'])pure+=fn(name);
pure+='return {camera,V,scale,dot,sub,cameraBasis,projectWorld,referenceAxes,currentAxisRanges,resize(w,h){viewportWidth=w;viewportHeight=h;}};})();';
const app=vm.runInNewContext(pure),{camera,V}=app;
const close=(a,b,msg)=>assert(Math.abs(a-b)<1e-6,msg||a+' != '+b);
const initialAxes=app.referenceAxes(app.cameraBasis(),app.currentAxisRanges());
assert.equal(initialAxes.length,3);
for(const axis of initialAxes){
  assert.deepEqual(Array.from(axis.ticks),[0,2000,4000],'Ticks remain 1 physical metre apart');
  const basis=app.cameraBasis(),origin=app.projectWorld(V(),basis);
  close((origin.x-axis.start.x)*axis.uy-(origin.y-axis.start.y)*axis.ux,0,'Every axis passes through the physical origin');
  const end=app.projectWorld(app.scale(axis.unit,4500),basis);
  close(end.x,axis.end.x);close(end.y,axis.end.y);
  const begin=app.projectWorld(app.scale(axis.unit,-500),basis);
  close(begin.x,axis.start.x);close(begin.y,axis.start.y);
}
for(const [yaw,pitch,expected] of [[0,0,['x','z']],[-Math.PI/2,0,['y','z']],[0,Math.PI/2,['x','y']]]){
  camera.yaw=yaw;camera.pitch=pitch;
  assert.deepEqual(Array.from(app.referenceAxes(app.cameraBasis(),app.currentAxisRanges()),a=>a.axis),expected,'The depth axis is omitted in orthogonal views');
}
let cases=0;
for(const [width,height] of [[900,650],[370,620]])for(const distance of [5200,13800,26000])
for(const target of [V(2000,2000,2000),V(-5000,1000,7000)])for(let i=0;i<24;i++)for(const pitch of [-Math.PI/2,-.6,0,.6,Math.PI/2]){
  app.resize(width,height);Object.assign(camera,{distance,target,yaw:i*Math.PI/12,pitch});
  const basis=app.cameraBasis(),axes=app.referenceAxes(basis,app.currentAxisRanges());
  assert(axes.length<=3);
  for(const a of axes){
    for(const p of [a.start,a.end]){
      assert(Number.isFinite(p.x)&&Number.isFinite(p.y),'No nonfinite projection at near-plane crossings');
      assert(p.x>=16-1e-6&&p.x<=width-16+1e-6&&p.y>=16-1e-6&&p.y<=height-16+1e-6,'Axes clipped within the viewport');
    }
    close(Math.hypot(a.ux,a.uy),1);close(a.ux*a.nx+a.uy*a.ny,0);
    assert(Math.abs(app.dot(a.unit,basis.forward))<=.985);
    for(let j=1;j<a.ticks.length;j++)close(a.ticks[j]-a.ticks[j-1],2000);
  }
  cases++;
}
assert(!/cube|corners|edges|spaceGridSegments|drawSpaceGrid/i.test(fn('drawReferenceFrame')),'Reference renderer contains only axes; the optional grid is drawn separately');
console.log('PASS: three axes at a common origin, positive tips, 1 m ticks, orthogonal views and '+cases+' camera/zoom/near-plane cases.');
