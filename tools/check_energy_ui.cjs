/* Lightweight controller unit tests; no browser or external DOM dependency.
 * Tests the source archive with a small DOM/canvas adapter, not visual layout.
 */
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const zip = path.join(__dirname, '..', 'energie_mecanique_webapp_fr.zip');
const read = name => execFileSync('unzip', ['-p', zip, 'energie_mecanique_webapp_fr_source/' + name], {encoding: 'utf8'});
const html = read('index.html'), source = read('app.js'), css = read('style.css');
const nodes = new Map(), frames = [], reported = [];
let width = 640;
let mathStylesInstalled = false;
const ctx = new Proxy({}, {get(target, key) {
  if (key in target) return target[key];
  return (...args) => {
    for (const a of args.flat()) if (typeof a === 'number') assert(Number.isFinite(a), 'canvas finite coordinate');
  };
}});
class Element {
  constructor(tag = 'span') {
    this.tag = tag; this.children = []; this.dataset = {}; this.style = {}; this.attrs = {}; this.events = {};
    this.classList = {add() {}}; this.value = ''; this.checked = false; this.hidden = false;
  }
  set id(value) { this._id = value; nodes.set(value, this); }
  get id() { return this._id; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  addEventListener(key, fn) { this.events[key] = fn; }
  fire(key, event = {}) { this.events[key]?.({target: this, preventDefault() {}, ...event}); }
  click() { this.fire('click'); }
  closest() { return null; }
  cloneNode(deep) {
    const result = new Element(this.tag); result.dataset = {...this.dataset}; result.className = this.className;
    if (deep) result.children = this.children.map(c => typeof c === 'string' ? c : c.cloneNode(true));
    return result;
  }
  getBoundingClientRect() { return {width, height: this.id?.startsWith('scene') ? 330 : 280, left: 0}; }
  getContext() { return ctx; }
  setPointerCapture(id) { this.pointer = id; }
  hasPointerCapture(id) { return this.pointer === id; }
}
for (const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
  const el = new Element(match[1]); el.id = match[3];
  el.value = /\bvalue="([^"]*)"/.exec(match[2])?.[1] || '';
  el.checked = /\bchecked\b/.test(match[2]);
}
const $ = id => { assert(nodes.has(id), 'missing element ' + id); return nodes.get(id); };
$('model-select').value = 'oscillator'; $('playback-speed').value = '1';
const document = {readyState: 'complete', createElement: tag => new Element(tag), getElementById: $, querySelectorAll: () => [], addEventListener() {}};
const context = {
  document, window: {devicePixelRatio: 1},
  MathJax: {startup: {promise: Promise.resolve(), document: {updateDocument() { mathStylesInstalled = true; }}}, tex2svg(text) { assert(!text.includes('NaN')); const node = new Element('math'); node.dataset.tex = text; return node; }},
  Option: function(text, value) { const node = new Element('option'); node.value = value; node.textContent = text; return node; },
  ResizeObserver: class { observe() {} },
  requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
  console: {error(e) { reported.push(e); }},
};
function tick(time = 100) { const queue = frames.splice(0); queue.forEach(fn => fn(time)); }
function checkHistoryAnnotations(withFriction = false, gravity = false) {
  const labels = $('history-labels').children.filter(node => !node.hidden);
  const title = labels.find(node => node.dataset.math === (gravity ? 'E\\,[10^{12}\\,\\mathrm J]' : 'E\\,[\\mathrm J]'));
  const ticks = labels.filter(node => node.className.includes('tick') && parseFloat(node.style.left) === 41);
  assert(title && ticks.length === 5, 'energy title and all vertical ticks are present');
  assert(Math.min(...ticks.map(node => parseFloat(node.style.top))) - parseFloat(title.style.top) >= 30,
    'unit title has its own row above the vertical graduations');
  const lines = $('chart-key').children.map(row => row.children[0]).filter(node => node.className === 'legend-line');
  assert.equal(lines.length, withFriction ? 2 : 1, 'energy curves use dedicated line samples');
  assert(lines[0].style.borderTop.includes(withFriction ? 'solid' : 'dashed'));
  if (withFriction) assert(lines[1].style.borderTop.includes('dashed'), 'initial energy reference remains dashed');
  if (gravity) {
    assert(ticks.some(node => parseFloat(node.dataset.math) < 0), 'negative gravitational potential fits on chart');
    assert(ticks.some(node => parseFloat(node.dataset.math) > 0), 'positive kinetic energy fits on chart');
  }
}
async function main() {
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(reported, []);
  assert($('loading').hidden, 'initialization completes');
  assert(mathStylesInstalled, 'MathJax page styles must be installed for direct tex2svg output');
  const legendStyle = /\.legend-line\s*\{([^}]+)\}/.exec(css)?.[1];
  assert(legendStyle && /width:\s*1\.75rem/.test(legendStyle), 'long energy legend sample');
  assert(/height:\s*0\s*;/.test(legendStyle) && /align-self:\s*center/.test(legendStyle), 'line itself is vertically centered');
  checkHistoryAnnotations();
  const assistiveStyle = /\.phys-app mjx-assistive-mml\s*\{([^}]+)\}/.exec(css)?.[1];
  assert(assistiveStyle, 'accessible MathML has a scoped visually-hidden fallback');
  assert(assistiveStyle.includes('position: absolute !important'));
  assert(assistiveStyle.includes('clip-path: inset(50%) !important'));
  assert(!/display:\s*none|visibility:\s*hidden/.test(assistiveStyle), 'preserve screen-reader access');
  for (const end of [40, 80, 250, 600, 1200]) {
    const points = vm.runInNewContext(`coilSpringPoints(20, ${end}, 100)`, context);
    assert.equal(points[0][0], 20); assert.equal(points[points.length - 1][0], end);
    assert(points.every(([x,y]) => x >= 20 - 1e-9 && x <= end + 1e-9 && Math.abs(y - 100) <= 10.000001), 'spring stays attached within its bounds');
    assert(points.some(([x], i) => i && x < points[i - 1][0]), 'projected spires must loop, not be a zigzag or simple wave');
    assert.equal(points.length, 12 * 48 + 3, 'twelve smoothly sampled coils');
  }
  assert.equal($('value-m').dataset.number, '1.00|\\mathrm{kg}', 'initial values are TeX');
  assert.equal($('total-readout').dataset.number, '2.000|\\mathrm J');
  $('time-slider').value = '.785398'; $('time-slider').fire('input');
  assert($('kinetic-readout').dataset.number.startsWith('2.000|'));
  $('param-k').value = '10'; $('param-k').fire('input'); tick();
  assert.equal($('example-select').value, 'custom');
  assert.equal($('total-readout').dataset.number, '5.000|\\mathrm J');
  $('reset-parameters').click();
  assert.equal($('value-k').dataset.number, '4.00|\\mathrm{N\\,m^{-1}}');
  for (const model of ['oscillator', 'simple-pendulum', 'pendulum']) {
    $('model-select').value = model; $('model-select').fire('change');
    assert.equal($('position-badge').hidden, model === 'pendulum');
    assert.equal($('detail-row').hidden, model !== 'pendulum');
    assert.equal($('trail-row').hidden, model === 'oscillator');
    if (model === 'simple-pendulum') {
      assert.equal($('value-l').dataset.number, '1.20|\\mathrm m');
      assert.equal($('value-theta0').dataset.number, '15|{}^\\circ');
      assert.equal($('position-symbol').dataset.math, '\\theta=');
      assert.equal($('position-readout').dataset.number, '15.00|{}^\\circ');
      $('param-l').value = '2'; $('param-l').fire('input'); tick();
      assert.equal($('value-l').dataset.number, '2.00|\\mathrm m');
      assert.equal($('example-select').value, 'custom');
      assert($('scene').attrs['aria-label'].startsWith('Pendule simple.'));
    }
    for (const example of ['0', '1', '2', '3']) {
      $('example-select').value = example; $('example-select').fire('change');
      for (const time of ['0', '1.234', '29.999', '30']) {
        $('time-slider').value = time; $('time-slider').fire('input');
        for (const id of ['kinetic-readout', 'potential-readout', 'total-readout', 'error-readout']) {
          assert($(id).dataset.number && !$(id).dataset.number.includes(','), 'decimal dot and TeX value');
        }
      }
    }
    $('detail').checked = false; $('detail').fire('change');
    assert.equal($('energy-key').children.length, 2);
    $('detail').checked = true; $('detail').fire('change');
    assert.equal($('energy-key').children.length, model === 'pendulum' ? 4 : 2);
    $('stacked').checked = false; $('stacked').fire('change');
    $('stacked').checked = true; $('stacked').fire('change');
    width = 300; $('trail').fire('change'); checkHistoryAnnotations(); width = 640;
  }
  $('example-select').value = '0'; $('example-select').fire('change');
  $('play').click(); tick(1000); tick(1100);
  assert.equal($('play').textContent, 'Pause');
  assert(Number($('time-slider').value) > 0);
  $('restart').click(); assert.equal(Number($('time-slider').value), 0);
  $('duration').value = '60'; $('duration').fire('input'); tick(1200);
  assert.equal(Number($('time-slider').max), 60);
  $('history').fire('keydown', {key: 'End'}); assert.equal(Number($('time-slider').value), 60);
  $('history').fire('keydown', {key: 'Home'}); assert.equal(Number($('time-slider').value), 0);
  $('history').fire('pointerdown', {clientX: 340, pointerId: 1});
  assert(Number($('time-slider').value) > 20 && Number($('time-slider').value) < 40);
  for (const model of ['oscillator', 'simple-pendulum', 'pendulum']) {
    $('model-select').value = model; $('model-select').fire('change');
    $('friction-toggle').checked = true; $('friction-toggle').fire('change');
    assert(!$('damping-controls').hidden && !$('dissipation-card').hidden);
    assert.equal($('friction-badge').textContent, 'Avec frottements');
    checkHistoryAnnotations(true);
    assert.equal($('damping-readout').dataset.number, '0.25|\\mathrm{s^{-1}}');
    assert.equal($('energy-key').children.length, model === 'pendulum' ? 5 : 3);
    assert($('error-symbol').dataset.math.includes('diss'));
    assert(!$('conservation-note').textContent.includes('sans frottement'));
    $('time-slider').value = '20'; $('time-slider').fire('input');
    const e = parseFloat($('total-readout').dataset.number), d = parseFloat($('dissipation-readout').dataset.number);
    assert(d > 0 && e < d, 'damping dissipates energy');
    assert(Math.abs(parseFloat($('error-readout').dataset.number)) < 1e-4);
    $('stacked').checked = false; $('stacked').fire('change');
    $('stacked').checked = true; $('stacked').fire('change');
    $('detail').checked = false; $('detail').fire('change');
    assert.equal($('energy-key').children.length, 3);
    $('detail').checked = true; $('detail').fire('change');
    $('damping-slider').value = '2'; $('damping-slider').fire('input'); tick();
    assert.equal(Number($('time-slider').value), 0);
    $('time-slider').value = '60'; $('time-slider').fire('input');
    assert(parseFloat($('total-readout').dataset.number) < .001);
    $('example-select').value = '3'; $('example-select').fire('change');
    $('time-slider').value = '60'; $('time-slider').fire('input');
    assert.equal(parseFloat($('dissipation-readout').dataset.number), 0, 'no dissipation at rest');
    $('reset-parameters').click();
    assert.equal($('damping-readout').dataset.number, '0.25|\\mathrm{s^{-1}}');
    $('friction-toggle').checked = false; $('friction-toggle').fire('change');
    assert($('damping-controls').hidden && $('dissipation-card').hidden);
    assert.equal($('friction-badge').textContent, 'Sans frottement');
    checkHistoryAnnotations();
    assert.equal($('energy-key').children.length, model === 'pendulum' ? 4 : 2);
    $('time-slider').value = '20'; $('time-slider').fire('input');
    assert.equal(parseFloat($('dissipation-readout').dataset.number), 0);
  }
  $('friction-toggle').checked = true;
  $('model-select').value = 'gravity'; $('model-select').fire('change');
  assert($('friction-row').hidden && $('damping-controls').hidden && $('dissipation-card').hidden, 'gravity is an isolated two-body system');
  assert.equal($('friction-badge').textContent, 'Gravitation seule');
  assert(!$('detail-row').hidden && !$('trail-row').hidden);
  assert.equal($('position-symbol').dataset.math, 'r=');
  assert.equal($('value-m1').dataset.number, '1.00|\\times10^{12}\\,\\mathrm{kg}', 'scaled mass rendered in LaTeX');
  assert.equal($('position-readout').dataset.number, '10.00|\\mathrm m');
  assert.equal($('total-readout').dataset.number, '-3.337|\\times10^{12}\\,\\mathrm J');
  assert.equal($('potential-readout').dataset.number, '-6.674|\\times10^{12}\\,\\mathrm J');
  assert.equal($('energy-meter').dataset.signed, 'true');
  assert.equal($('energy-key').children.length, 3, 'kinetic parts and one shared potential');
  assert(css.includes('.energy-meter[data-signed="true"]::after'), 'signed energy meter has a zero divider');
  checkHistoryAnnotations(false, true);
  $('param-m1').value = '2000000000000'; $('param-m1').fire('input'); tick();
  assert.equal($('value-m1').dataset.number, '2.00|\\times10^{12}\\,\\mathrm{kg}');
  assert.equal($('total-readout').dataset.number, '-6.674|\\times10^{12}\\,\\mathrm J');
  for (const example of ['0','1','2','3']) {
    $('example-select').value = example; $('example-select').fire('change');
    for (const time of ['0', '.0034', '10.234', '60']) {
      $('time-slider').value = time; $('time-slider').fire('input');
      assert(parseFloat($('potential-readout').dataset.number) < 0, 'potential remains negative');
      assert(parseFloat($('kinetic-readout').dataset.number) > 0, 'kinetic energy remains positive');
      const total = parseFloat($('total-readout').dataset.number);
      assert(example === '3' ? total > 0 : total < 0, 'bound and escaping energy signs');
      assert.equal(parseFloat($('error-readout').dataset.number), 0, 'small scaled energy error');
      for (let i = 0; i < 3; i++) {
        const segment = $('segment-'+i), top = parseFloat(segment.style.top), height = parseFloat(segment.style.height);
        assert(height >= 0 && top >= 0 && top+height <= 100, 'signed meter segment remains inside its bounds');
        assert(i === 2 ? top >= 50 : top+height <= 50+1e-10, 'potential below zero, kinetic energies above');
      }
    }
    $('detail').checked = false; $('detail').fire('change');
    assert.equal($('energy-key').children.length, 2);
    $('detail').checked = true; $('detail').fire('change');
    $('stacked').checked = false; $('stacked').fire('change');
    $('stacked').checked = true; $('stacked').fire('change');
    width = 300; $('trail').fire('change'); checkHistoryAnnotations(false, true); width = 640;
  }
  $('model-select').value = 'simple-pendulum'; $('model-select').fire('change');
  assert.equal($('energy-meter').dataset.signed, 'false', 'restore unsigned meter for pendulums');
  assert(!$('friction-row').hidden && !$('damping-controls').hidden, 'preserve friction preference on returning to a pendulum');
  assert.equal($('segment-0').style.top, '', 'clear signed positioning when changing model');
  assert.equal($('position-readout').dataset.number, '15.00|{}^\\circ');
  assert.deepEqual(reported, []);
  console.log('Energy UI controllers: four systems, signed gravitational energies, scaled LaTeX units, separated axis title, centered legend, accessible math, springs, examples, friction, sliders, playback and chart seeking passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
