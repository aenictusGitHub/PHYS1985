/* Canvas-operation checks on the actual source archives, not browser visual QA. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const apps = ['collisions', 'energie_mecanique', 'moment_cinetique'];
let reference;
for (const app of apps) {
  const name = app + '_webapp_fr';
  const source = execFileSync('unzip', ['-p', path.join(__dirname, '..', name + '.zip'), name + '_source/app.js'], {encoding:'utf8'});
  const helper = source.match(/function (?:sphere|body)\(ctx,x,y,r,index\)\{[\s\S]*?\n    \}/)?.[0];
  assert(helper, 'dedicated sphere renderer in ' + app);
  const normalized = helper.replace(/function (?:sphere|body)/, 'function sphere').replace(/\s+/g, '');
  if (reference) assert.equal(normalized, reference, app + ' uses exactly the Collisions relief');
  reference = normalized;
  const draw = vm.runInNewContext('(' + helper + ')');
  for (const index of [1,2]) for (const r of [2,5.5,10,24,120]) {
    const x=137,y=85, operations=[], gradients=[], stack=[];
    const ctx = {
      shadowColor:'transparent', shadowBlur:0, shadowOffsetY:0,
      createRadialGradient(...args) { const g={args,stops:[],addColorStop(a,c){this.stops.push([a,c]);}}; gradients.push(g); return g; },
      save() {stack.push({shadowColor:this.shadowColor,shadowBlur:this.shadowBlur,shadowOffsetY:this.shadowOffsetY});},
      restore() {Object.assign(this,stack.pop());},
      beginPath() {}, arc(...args) {operations.push(['arc',...args]);},
      fill() {operations.push(['fill',this.fillStyle,this.shadowColor,this.shadowBlur,this.shadowOffsetY]);},
      stroke() {operations.push(['stroke',this.strokeStyle,this.lineWidth,this.shadowBlur]);},
    };
    draw(ctx,x,y,r,index);
    assert.equal(gradients.length,1);
    assert.deepEqual(gradients[0].args,[x-r*.34,y-r*.38,r*.03,x-r*.08,y-r*.1,r*1.14]);
    assert.deepEqual(gradients[0].stops,index===1
      ? [[0,'#b8ddf6'],[.3,'#62a8d9'],[.7,'#2775b6'],[1,'#1c5280']]
      : [[0,'#e1f8ee'],[.3,'#b6e8d7'],[.7,'#94d9c5'],[1,'#529c89']]);
    assert.deepEqual(operations[0],['arc',x,y,r,0,2*Math.PI], 'body center and radius are untouched');
    assert.equal(operations[1][1],gradients[0]);
    assert.equal(operations[1][3],Math.min(7,r*.3));
    assert.deepEqual(operations[2],['stroke',index===1?'#23679c':'#68ae9a',.7,0], 'no white outline or leaked shadow');
    assert.equal(stack.length,0);
  }
}
console.log('Sphere relief: identical blue/mint gradients, lighting, geometry, outlines and isolated shadows in all three packaged applications.');
