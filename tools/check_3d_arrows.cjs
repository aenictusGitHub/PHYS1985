/* Tests the packaged 3D vector renderer without browser automation.
 * Run: node tools/check_3d_arrows.cjs */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const zip = path.join(root, 'cinematique_3d_webapp_fr.zip');
const entry = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
  .split('\n').find(file => /^[^/]+\/app\.js$/.test(file));
const source = execFileSync('unzip', ['-p', zip, entry], { encoding: 'utf8' });
new vm.Script(source);
assert(fs.readFileSync(path.join(root, 'cinematique_3d_webapp_fr.html'), 'utf8').includes(source),
  'Standalone and source archive must match');
const fn = name => {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, name);
  return source.slice(start, source.indexOf('\n  }\n', start) + 5) + '\n';
};
let pure = source.slice(0, source.indexOf("  const viewport = document.getElementById('viewport');"));
pure += source.match(/  const camera = \{[\s\S]*?\n  \};/)[0] + '\n';
pure += [
  'const commands = [];',
  'const ctx = new Proxy({}, {get(target, key) {',
  '  if (key in target) return target[key];',
  '  return (...args) => {',
  '    for (const value of args) if (typeof value === "number" && !Number.isFinite(value))',
  '      throw new Error(key + ": nonfinite coordinate");',
  '    commands.push([key, ...args]);',
  '    if (key === "createRadialGradient") return {addColorStop() {}};',
  '  };',
  '}});',
  'let viewportWidth = 900, viewportHeight = 650;',
  'const state = {vectorScale: 1};',
  'let selection = {};',
  'const vectorSelection = () => selection;'
].join('\n') + '\n';
for (const name of ['cameraBasis', 'projectWorld', 'arrowMaterialColor', 'drawDepthArrowMarker',
  'buildArrowFaces', 'paintArrowFaces', 'drawArrow', 'drawSelectedVectors']) pure += fn(name);
pure += [
  'return {V,add,sub,scale,dot,norm,toWorld,toScene,SCENE_UNITS_PER_METRE,ARROW,COLORS,TRAJECTORIES,derivatives,',
  'camera,commands,state,cameraBasis,buildArrowFaces,paintArrowFaces,',
  'resize(w,h){viewportWidth=w;viewportHeight=h;},',
  'drawAll(key,t){commands.length=0;',
  'selection={position:true,velocity:true,acceleration:true,normal:true,tangential:true,jerk:true};',
  'drawSelectedVectors(TRAJECTORIES[key],derivatives(TRAJECTORIES[key],t),cameraBasis());',
  'return commands;}};',
  '})();'
].join('\n');
const app = vm.runInNewContext(pure);
const {V,add,sub,scale,dot,norm,toWorld,toScene} = app;
const fromScene = p => scale(toWorld(p),1/app.SCENE_UNITS_PER_METRE);
const close = (a,b,tolerance=1e-7) => assert(Math.abs(a-b)<=tolerance, a+' != '+b);
const html = execFileSync('unzip', ['-p', zip, entry.replace('app.js', 'index.html')], {encoding:'utf8'});
assert(!/id="projection-toggle"[^>]*checked/.test(html), 'Projections are off by default');
assert(/projections: false/.test(source), 'Default state matches the unchecked control');
assert(html.includes('id="top-view"'), 'Top view is directly accessible');
assert(source.includes('dom.projections.checked = state.projections;'));
const topViewHandler = source.match(/dom\.topView\.addEventListener\('click', \(\) => \{([\s\S]*?)\n  \}\);/)[1];
const initialCamera = JSON.parse(JSON.stringify(app.camera));
let redraws = 0;
vm.runInNewContext(topViewHandler, {camera:app.camera, updateAndDraw(){redraws++;}});
close(app.camera.pitch, Math.PI/2);
assert.equal(redraws, 1);
assert.equal(app.camera.yaw, initialCamera.yaw);
assert.equal(app.camera.distance, initialCamera.distance);
assert.equal(JSON.stringify(app.camera.target), JSON.stringify(initialCamera.target));
for(const [control,axis,up] of [['frontView',V(1,0,0),V(0,0,1)],['sideView',V(0,1,0),V(0,0,1)]]){
  const id=control==='frontView'?'front-view':'side-view';assert(html.includes('id="'+id+'"'));
  const handler=source.match(new RegExp("dom\\."+control+"\\.addEventListener\\('click', \\(\\) => \\{([\\s\\S]*?)\\n  \\}\\);"))[1];
  for(const distance of [5200,13800,26000]){
    app.camera.target=V(1400,-900,3200);app.camera.distance=distance;const before=JSON.stringify(app.camera.target);
    const count=redraws;vm.runInNewContext(handler,{camera:app.camera,updateAndDraw(){redraws++;}});
    assert.equal(redraws,count+1);assert.equal(app.camera.distance,distance);assert.equal(JSON.stringify(app.camera.target),before);
    close(app.camera.pitch,0);const basis=app.cameraBasis();
    close(norm(sub(basis.right,toWorld(axis))),0);close(norm(sub(basis.up,toWorld(up))),0);
    close(dot(basis.forward,toWorld(axis)),0);close(dot(basis.forward,toWorld(up)),0);
  }
}
for (const sign of [-1,1]) for (let i=0;i<24;i++) {
  app.camera.yaw=i*Math.PI/12;
  app.camera.pitch=sign*Math.PI/2;
  const pole=app.cameraBasis();
  for (const axis of [pole.forward,pole.right,pole.up]) close(norm(axis),1);
  close(dot(pole.forward,pole.right),0);
  close(dot(pole.forward,pole.up),0);
  close(dot(pole.right,pole.up),0);
  close(norm(sub(pole.forward,V(0,-sign,0))),0);
  app.camera.pitch=sign*(Math.PI/2-1e-7);
  const near=app.cameraBasis();
  close(norm(sub(near.right,pole.right)),0);
  close(norm(sub(near.up,pole.up)),0,2e-7);
}
Object.assign(app.camera,initialCamera);
let seed=91873;
const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
let views=0;
const parts=new Set();
for (const size of [[280,400],[900,650]]) for (const distance of [3500,13800,42000]) {
  app.resize(...size);
  app.camera.distance=distance;
  for (let i=0;i<100;i++) {
    app.camera.yaw=random()*2*Math.PI;
    app.camera.pitch=(random()-.5)*2.5;
    const basis=app.cameraBasis();
    const origin=fromScene(app.camera.target);
    const vector=scale(V((random()-.5)*1800,(random()-.5)*1800,(random()-.5)*1800),1/app.SCENE_UNITS_PER_METRE);
    const direction=toScene(vector), length=norm(direction), unit=scale(direction,1/length);
    const faces=app.buildArrowFaces(origin,vector,1,app.COLORS.velocity,basis);
    assert(faces.length>0,'Visible arrow has a mesh');
    for (const face of faces.filter(f=>f.kind==='face')) {
      parts.add(face.part);
      close(norm(face.normal),1);
      assert(/^rgb\(\d+,\d+,\d+\)$/.test(face.color));
      for (const p of face.points) {
        assert(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.depth>5);
      }
      for (const p of face.vertices) {
        const axial=dot(sub(p,toScene(origin)),unit);
        assert(axial>=-1e-7&&axial<=length+app.ARROW.headLengthWorld+1e-7);
        if (face.part==='shaft') assert(Math.min(Math.abs(axial),Math.abs(axial-length))<1e-7);
      }
      if (face.part==='head') close(norm(sub(face.vertices[2],
        add(toScene(origin),scale(unit,length+app.ARROW.headLengthWorld)))),0);
    }
    app.paintArrowFaces(faces);
    for (let j=1;j<faces.length;j++) assert(faces[j-1].depth>=faces[j].depth);
    views++;
  }
}
for (const part of ['tail','shaft','shoulder','head']) assert(parts.has(part),part);
app.resize(900,650);
app.camera.distance=13800;
const b=app.cameraBasis(), origin=fromScene(app.camera.target);
for (const sign of [-1,1]) {
  const faces=app.buildArrowFaces(origin,fromScene(scale(b.forward,sign*1000)),1,app.COLORS.velocity,b);
  const marker=faces.find(f=>f.kind==='depth-marker');
  assert(marker,'End-on arrow is identifiable');
  assert.equal(marker.towardCamera,sign<0);
  app.paintArrowFaces(faces);
  assert.equal(faces.at(-1),marker,'Direction cue must remain visible over its own cap');
}
const side=app.buildArrowFaces(origin,fromScene(scale(b.right,1000)),1,app.COLORS.velocity,b);
assert(new Set(side.map(f=>f.color)).size>=6,'Lighting supplies visible tonal variation');
for (const [vector,factor] of [[V(),1],[V(Infinity,0,0),1],[V(200,100,300),0]]) {
  assert.equal(app.buildArrowFaces(origin,vector,factor,app.COLORS.velocity,b).length,0);
}
for (const z of [-10,1,6,30]) {
  const o=fromScene(add(b.cameraPosition,scale(b.forward,z)));
  app.paintArrowFaces(app.buildArrowFaces(o,scale(V(100,20,-30),1/app.SCENE_UNITS_PER_METRE),1,app.COLORS.velocity,b));
}
const cameraBefore=JSON.stringify(app.camera);
for (const [key,item] of Object.entries(app.TRAJECTORIES)) for (const fraction of [0,.31,.7,1]) {
  const commands=app.drawAll(key,fraction*item.duration);
  assert(commands.length>0);
  assert.equal(commands.filter(c=>c[0]==='save').length,commands.filter(c=>c[0]==='restore').length);
}
assert.equal(JSON.stringify(app.camera),cameraBefore,'Drawing never changes framing');
assert(!/rgba\(255|#fff/i.test(fn('paintArrowFaces')),'No white seams on mesh faces');
console.log('3D arrows: '+views+' camera/zoom cases; '+Object.keys(app.TRAJECTORIES).length+
  ' trajectories; end-on visibility, geometry, lighting and archive consistency passed.');
