/* Lightweight controller unit tests; no browser or external DOM dependency.
 * Tests the source archive with a small DOM/canvas adapter, not visual layout.
 */
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const zip = path.join(__dirname, '..', 'energie_mecanique_webapp_fr.zip');
const read = name => execFileSync('unzip', ['-p', zip, 'energie_mecanique_webapp_fr_source/' + name], {encoding: 'utf8'});
const html = read('index.html'), source = read('app.js');
const nodes = new Map(), frames = [], reported = [];
let width = 640;
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
  MathJax: {startup: {promise: Promise.resolve()}, tex2svg(text) { assert(!text.includes('NaN')); const node = new Element('math'); node.dataset.tex = text; return node; }},
  Option: function(text, value) { const node = new Element('option'); node.value = value; node.textContent = text; return node; },
  ResizeObserver: class { observe() {} },
  requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
  console: {error(e) { reported.push(e); }},
};
function tick(time = 100) { const queue = frames.splice(0); queue.forEach(fn => fn(time)); }
async function main() {
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(reported, []);
  assert($('loading').hidden, 'initialization completes');
  assert.equal($('value-m').dataset.number, '1.00|\\mathrm{kg}', 'initial values are TeX');
  assert.equal($('total-readout').dataset.number, '2.000|\\mathrm J');
  $('time-slider').value = '.785398'; $('time-slider').fire('input');
  assert($('kinetic-readout').dataset.number.startsWith('2.000|'));
  $('param-k').value = '10'; $('param-k').fire('input'); tick();
  assert.equal($('example-select').value, 'custom');
  assert.equal($('total-readout').dataset.number, '5.000|\\mathrm J');
  $('reset-parameters').click();
  assert.equal($('value-k').dataset.number, '4.00|\\mathrm{N\\,m^{-1}}');
  for (const model of ['oscillator', 'pendulum']) {
    $('model-select').value = model; $('model-select').fire('change');
    assert.equal($('position-badge').hidden, model !== 'oscillator');
    assert.equal($('detail-row').hidden, model !== 'pendulum');
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
    width = 300; $('trail').fire('change'); width = 640;
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
  assert.deepEqual(reported, []);
  console.log('Energy UI controllers: initial TeX values, both modes, all examples, sliders, reset, display options, playback, keyboard and chart seeking passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
