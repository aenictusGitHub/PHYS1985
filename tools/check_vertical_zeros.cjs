/* Source-level regression audit of existing axis generators. The four newer
 * apps also exercise zero placement and spacing in their controller tests. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const project = path.join(__dirname, '..');
function source(name) {
  const zip = path.join(project, name + '.zip');
  const entry = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    .split('\n').find(file => /^[^/]+\/app\.js$/.test(file));
  assert(entry, name + ': app.js in archive');
  return execFileSync('unzip', ['-p', zip, entry], { encoding: 'utf8' });
}
for (const name of ['cinematique_2d_webapp_fr', 'cinematique_3d_webapp_fr']) {
  const code = source(name);
  const step = code.match(/const AXIS_TICK_STEP = ([\d.]+);/);
  const generator = code.match(/const axisTickValues = \(minimum, maximum\) => \{[\s\S]*?\n  \};/);
  assert(step && generator, name + ': regular axis generator');
  const ticks = vm.runInNewContext(`const AXIS_TICK_STEP = ${step[1]}; ${generator[0]} axisTickValues;`);
  for (const [low, high] of [[-6000,6000],[-4000,0],[0,4000],[-1,1],[-2100,3900]]) {
    const values = Array.from(ticks(low, high));
    assert.equal(values.filter(value => value === 0).length, 1, name + ': one zero');
    assert(!values.some(value => Object.is(value, -0)), name + ': no negative zero');
  }
  for (const [low, high] of [[2000,6000],[-6000,-2000]]) {
    assert(!Array.from(ticks(low, high)).includes(0), name + ': no out-of-range zero');
  }
  assert(/setMathDigits\((?:record\.)?digits, String\(tick\)\)/.test(code), name + ': zero rendered as 0');
  console.log(name + ': visible axes preserve the zero tick.');
}
{
  const name = 'puissance_travail_webapp_fr', code = source(name);
  const loop = code.match(/for \(let i = -2; i <= 2; i \+= 1\) \{\s*const value = \(i \/ 2\) \* yLimit;\s*addTick\(value, margin.left - 8, yMap\(value\), "y-tick"\);\s*\}/);
  assert(loop, 'Power: vertical tick generator');
  for (const yLimit of [1e-6, .29, 1, 1e6]) {
    const ticks = [];
    const yMap = value => 94 + (yLimit - value) / (2 * yLimit) * 300;
    vm.runInNewContext(loop[0], { yLimit, margin: { left: 66 }, yMap, addTick: (...tick) => ticks.push(tick) });
    const zeros = ticks.filter(tick => tick[0] === 0);
    assert.equal(zeros.length, 1);
    assert.equal(zeros[0][2], yMap(0));
    assert.equal(zeros[0][3], 'y-tick');
  }
  console.log(name + ': one zero at the power sign change.');
}
for (const name of ['energie_mecanique_webapp_fr', 'potentiel_force_webapp_fr', 'moment_cinetique_webapp_fr', 'collisions_webapp_fr']) {
  const code = source(name);
  assert(/['"]y-zero['"],\s*(?:['"]0['"]|0),/.test(code), name + ': explicit zero label');
  assert(/Math\.abs\([^\n]*Y\(0\)[^\n]*>=\s*22/.test(code), name + ': nearby labels separated');
}
const frictionPath = path.join(project, '_prototypes/frottements_solides/app.js');
if (fs.existsSync(frictionPath)) {
  assert(fs.readFileSync(frictionPath, 'utf8').includes("'y-zero',0"), 'Friction: explicit zero label');
  console.log('Local, unpublished friction prototype: explicit zero audited.');
}
console.log('Explicit vertical zeros audited in all seven packaged apps.');
