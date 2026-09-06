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
let canvasId = '', strokePoints = [], circle = null;
const sceneStrokes = [], sceneFills = [];
const ctx = new Proxy({}, {get(target, key) {
  if (key in target) return target[key];
  return (...args) => {
    for (const a of args.flat()) if (typeof a === 'number') assert(Number.isFinite(a), 'canvas finite coordinate');
    if (key === 'beginPath') { strokePoints = []; circle = null; }
    if (key === 'arc') circle = [...args];
    if (key === 'moveTo' || key === 'lineTo') strokePoints.push([...args]);
    if (key === 'clearRect' && canvasId === 'scene-canvas') { sceneStrokes.length = 0; sceneFills.length = 0; }
    if (key === 'fill' && canvasId === 'scene-canvas' && circle) sceneFills.push({circle, color: target.fillStyle});
    if (key === 'stroke' && canvasId === 'scene-canvas') sceneStrokes.push({points: strokePoints, color: target.strokeStyle, width: target.lineWidth});
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
  getAttribute(key) { return this.attrs[key]; }
  addEventListener(key, fn) { this.events[key] = fn; }
  fire(key, event = {}) { this.events[key]?.({target: this, preventDefault() {}, ...event}); }
  click() { this.fire('click'); }
  closest() { return null; }
  cloneNode(deep) {
    const result = new Element(this.tag); result.dataset = {...this.dataset}; result.className = this.className;
    if (deep) result.children = this.children.map(c => typeof c === 'string' ? c : c.cloneNode(true));
    return result;
  }
  getBoundingClientRect() { return {width, height: this.id?.startsWith('scene') ? ($('scene').dataset.velocity === 'true' ? 390 : 330) : 280, left: this.id === 'scene-canvas' ? 25 : 0, top: this.id === 'scene-canvas' ? 110 : 0}; }
  getContext() { canvasId = this.id; return ctx; }
  setPointerCapture(id) { this.pointer = id; }
  hasPointerCapture(id) { return this.pointer === id; }
  releasePointerCapture(id) { this.pointer = undefined; this.fire('lostpointercapture', {pointerId: id}); }
  focus() { this.focused = true; }
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
  MathJax: {startup: {promise: Promise.resolve(), document: {updateDocument() { mathStylesInstalled = true; }}}, tex2svg(text) { assert(!text.includes('NaN')); assert(!/[\x00-\x1f]/.test(text), 'TeX commands must not become JavaScript control characters'); const node = new Element('math'); node.dataset.tex = text; return node; }},
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
function checkOscillatorVisualOptions() {
  const run = code => vm.runInNewContext(code, context);
  assert.equal(run('springColor(100,100)'), 'rgb(96, 113, 133)', 'neutral equilibrium tint');
  const compression = run('springColor(0,100)'), extension = run('springColor(200,100)');
  assert.notEqual(compression, extension);
  assert.equal(run('springColor(400,200)'), extension, 'tint follows relative length, not screen size');
  assert.equal(run('springColor(500,100)'), extension, 'extension color stays restrained');
  let previous;
  for (let length = 0; length <= 200; length++) {
    const channels = run(`springColor(${length},100)`).match(/\d+/g).map(Number);
    assert(channels.every(channel => channel >= 71 && channel <= 145), 'subtle palette');
    if (previous) assert(channels.every((c,i) => Math.abs(c-previous[i]) <= 1), 'continuous color progression');
    previous = channels;
  }
  for (const w of [300,640,1200]) for (const A of [.2,1,2,13]) {
    const center = (w + 16) / 2, ppm = (w-72)/(2*Math.max(2.15,A*1.12)), maxSpeed = 2*A;
    let scale;
    for (let i = 0; i <= 100; i++) {
      const angle = i*2*Math.PI/100, x = A*Math.cos(angle), v = -maxSpeed*Math.sin(angle);
      const arrow = run(`oscillatorVelocityArrow(${x},${v},${A},${maxSpeed},${center},${ppm},${w},288)`);
      assert(arrow.start >= 12-1e-9 && arrow.start <= w-12+1e-9 && arrow.end >= 12-1e-9 && arrow.end <= w-12+1e-9, 'vector remains inside scene');
      if (Math.abs(v) > 1e-8) {
        assert.equal(Math.sign(arrow.delta), Math.sign(v), 'instantaneous direction');
        if (scale !== undefined) assert(Math.abs(arrow.delta/v-scale) < 1e-10, 'fixed linear velocity scale');
        scale = arrow.delta/v;
      }
      assert.equal(arrow.tip[1][0], arrow.end, 'arrowhead is at shaft endpoint');
    }
  }
  assert(run('oscillatorVelocityArrow(0,0,0,0,328,100,640,288)').zero, 'rest has no invented direction');
  assert(run('oscillatorVelocityArrow(0,5,3,6,328,114,640,288)').delta > 0, 'a fixed drag view never erases nonzero velocity');
  const visibleVelocity = () => $('scene-labels').children.find(node => !node.hidden && node.dataset.math?.includes('\\vec v'));
  const velocityStrokes = () => sceneStrokes.filter(stroke => stroke.color === '#bc8b3b' && stroke.width === 2.5);
  assert(!$('velocity-toggle').checked && !$('velocity-row').hidden && !visibleVelocity(), 'optional velocity starts hidden');
  $('velocity-toggle').checked = true; $('velocity-toggle').fire('change');
  assert.equal(visibleVelocity().dataset.math, '\\vec v=\\vec 0');
  assert.equal(velocityStrokes().length, 0, 'zero velocity has no arrow');
  assert.equal($('scene').dataset.velocity, 'true');
  assert.equal(parseFloat($('mass-handle-0').style.top), 338, 'dedicated vector band leaves mechanical layout clear');
  for (const friction of [false,true]) {
    $('friction-toggle').checked = friction; $('friction-toggle').fire('change');
    for (const t of [.2,.785398,2.35619]) {
      $('time-slider').value = String(t); $('time-slider').fire('input');
      assert.equal(visibleVelocity().dataset.math, '\\vec v(t)');
      assert($('scene').attrs['aria-label'].includes('Vitesse horizontale'));
      const strokes = velocityStrokes();
      assert.equal(strokes.length, 2, 'canvas draws both shaft and head without a white outline');
      const displayedV = Number(/Vitesse horizontale ([\d.-]+)/.exec($('scene').attrs['aria-label'])[1]);
      assert.equal(Math.sign(strokes[0].points[1][0] - strokes[0].points[0][0]), Math.sign(displayedV));
      assert.deepEqual(strokes[0].points[1], strokes[1].points[1], 'canvas arrowhead meets shaft');
      const before = $('total-readout').dataset.number;
      $('velocity-toggle').checked = false; $('velocity-toggle').fire('change');
      assert(!visibleVelocity());
      assert.equal(velocityStrokes().length, 0);
      $('velocity-toggle').checked = true; $('velocity-toggle').fire('change');
      assert.equal(Number($('time-slider').value), t, 'toggling never rewinds');
      assert.equal($('total-readout').dataset.number, before, 'visual options leave physics unchanged');
    }
  }
  $('friction-toggle').checked = false; $('friction-toggle').fire('change');
  const springStroke = () => sceneStrokes.find(stroke => stroke.color.startsWith('rgb('));
  const warmSpring = springStroke().color;
  $('time-slider').value = String(Math.PI/2); $('time-slider').fire('input');
  assert.notEqual(springStroke().color, warmSpring, 'actual coil tint changes with length');
  assert(springStroke().points.length > 500, 'tint is applied to smooth spires');
  $('restart').click();
  $('mass-handle-0').fire('keydown', {key:'ArrowLeft'});
  assert(Number($('param-x0').value) < 1 && Number($('time-slider').value) === 0, 'initial editing still works in expanded velocity view');
  assert.equal(parseFloat($('mass-handle-0').style.top), 338);
  $('reset-parameters').click();
  $('play').click(); tick(1000); tick(1100);
  $('velocity-toggle').checked = false; $('velocity-toggle').fire('change');
  assert.equal($('play').textContent, 'Pause', 'display toggle preserves playback');
  $('restart').click();
}
function checkGravityVelocityOptions() {
  const arrows = () => ['#2775b6', '#499e88'].map(color => sceneStrokes.filter(stroke => stroke.color === color && stroke.width === 2.5));
  const labels = () => $('scene-labels').children.filter(node => !node.hidden && node.dataset.math?.startsWith('\\vec v_'));
  const sceneLayout = () => ({
    bounds: $('scene-canvas').getBoundingClientRect(),
    masses: [0,1].map(i => [$('mass-handle-'+i).style.left, $('mass-handle-'+i).style.top]),
    labels: $('scene-labels').children.filter(node => !node.hidden && /^(m_[12]|C)$/.test(node.dataset.math)).map(node => [node.dataset.math, node.style.left, node.style.top]),
    // Separation line and barycenter axes must be unaffected by both options.
    structure: JSON.stringify(sceneStrokes.filter(stroke => ['#dce4ec','#607185'].includes(stroke.color))),
  });
  const trajectories = () => JSON.stringify(sceneStrokes.filter(stroke => ['#e0e9f1','#e0ede9'].includes(stroke.color) || (['#2775b6','#499e88'].includes(stroke.color) && stroke.width === 1.5)));
  const verifyOverlays = () => {
    const before = sceneLayout(), paths = trajectories(), vectors = JSON.stringify(arrows());
    $('velocity-toggle').checked = false; $('velocity-toggle').fire('change');
    assert.deepEqual(sceneLayout(), before, 'hiding velocity must not zoom or move any physical element or mass label');
    assert.equal(trajectories(), paths, 'hiding velocity must not reproject the trajectories');
    assert(arrows().every(parts => parts.length === 0) && labels().length === 0);
    $('trail').checked = false; $('trail').fire('change');
    assert.deepEqual(sceneLayout(), before, 'hiding trajectories must not reframe the physical scene');
    assert.equal(trajectories(), '[]');
    $('velocity-toggle').checked = true; $('velocity-toggle').fire('change');
    assert.deepEqual(sceneLayout(), before);
    assert.equal(JSON.stringify(arrows()), vectors, 'vectors have the same geometry with or without trajectories');
    $('trail').checked = true; $('trail').fire('change');
    assert.deepEqual(sceneLayout(), before);
    assert.equal(trajectories(), paths, 'restoring overlays recovers the exact same paths');
  };
  assert(!$('velocity-row').hidden && !$('velocity-toggle').checked);
  assert.equal($('velocity-label').textContent, 'Vitesses instantanées');
  assert.equal($('velocity-symbol').dataset.math, '\\vec v_1(t),\\;\\vec v_2(t)');
  $('velocity-toggle').checked = true; $('velocity-toggle').fire('change');
  for (const viewport of [300,640]) {
    width = viewport;
    for (const example of ['0','1','2','3']) {
      $('example-select').value = example; $('example-select').fire('change');
      const initialPoints = [0,1].map(i => [parseFloat($('mass-handle-'+i).style.left), parseFloat($('mass-handle-'+i).style.top)]);
      for (const time of ['0','.37','10.234','30','60']) {
        $('time-slider').value = time; $('time-slider').fire('input');
        const trails = ['#2775b6','#499e88'].map(color => sceneStrokes.find(stroke => stroke.color === color && stroke.width === 1.5));
        for (const [i, trail] of trails.entries()) {
          assert.equal(trail.points.length, Math.floor(Number(time)*60)+2, 'trajectory retains every sample from t=0, including after twelve seconds');
          if (example !== '3') assert.deepEqual(trail.points[0], initialPoints[i], 'bound trajectory still starts at initial body position');
          assert.deepEqual(trail.points.at(-1), [parseFloat($('mass-handle-'+i).style.left), parseFloat($('mass-handle-'+i).style.top)], 'trajectory ends exactly at current body');
        }
        const strokes = arrows();
        assert(strokes.every(parts => parts.length === 2), 'each body has one shaft and one head');
        const delta = strokes.map(parts => {
          assert.deepEqual(parts[0].points[1], parts[1].points[1], 'head at shaft endpoint');
          return parts[0].points[1].map((v,i) => v - parts[0].points[0][i]);
        });
        const lengths = delta.map(v => Math.hypot(...v));
        const ratio = Number($('param-m2').value) / Number($('param-m1').value);
        assert(Math.abs(lengths[0]/lengths[1] - ratio) < 1e-10, 'common scale preserves inverse-mass velocity ratio');
        assert(delta[0][0]*delta[1][0] + delta[0][1]*delta[1][1] < 0, 'barycentric velocities point in opposite directions');
        assert(Math.abs(delta[0][0]*delta[1][1] - delta[0][1]*delta[1][0]) < 1e-9);
        assert(lengths.every(length => length > 0 && length <= Math.min(40,width*.12) + 1e-6), 'periapsis reference bounds both lengths');
        if (time === '0') assert(delta[0][1] > 0 && delta[1][1] < 0, 'vertical projection has correct sign');
        assert.equal(labels().length, 2, 'two LaTeX velocity labels');
        assert.equal($('scene').dataset.velocity, 'false', 'gravity does not acquire the oscillator extra band');
        const before = $('total-readout').dataset.number;
        verifyOverlays();
        assert.equal(Number($('time-slider').value), Number(time));
        assert.equal($('total-readout').dataset.number, before, 'toggling does not change energy');
      }
    }
  }
  $('reset-parameters').click();
  $('mass-handle-1').fire('keydown', {key:'ArrowRight'});
  assert(Number($('param-r0').value) > 10, 'initial mass editing uses the velocity view projection');
  assert.equal(Number($('time-slider').value), 0);
  verifyOverlays();
  $('play').click(); tick(2000); tick(2100);
  verifyOverlays();
  assert.equal($('play').textContent, 'Pause', 'both overlays leave playback running');
  $('velocity-toggle').checked = false; $('velocity-toggle').fire('change');
  assert.equal($('play').textContent, 'Pause');
  $('restart').click(); $('reset-parameters').click();
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
  checkOscillatorVisualOptions();
  $('time-slider').value = '.785398'; $('time-slider').fire('input');
  assert($('kinetic-readout').dataset.number.startsWith('2.000|'));
  $('param-k').value = '10'; $('param-k').fire('input'); tick();
  assert.equal($('example-select').value, 'custom');
  assert.equal($('total-readout').dataset.number, '5.000|\\mathrm J');
  $('reset-parameters').click();
  assert.equal($('value-k').dataset.number, '4.00|\\mathrm{N\\,m^{-1}}');
  for (const model of ['oscillator', 'simple-pendulum', 'pendulum']) {
    $('model-select').value = model; $('model-select').fire('change');
    const defaultDuration = model === 'pendulum' ? 10 : 30;
    assert.equal(Number($('duration').value), defaultDuration, 'model-specific default duration');
    assert.equal($('duration-readout').dataset.number, `${defaultDuration}|\\mathrm s`);
    assert.equal(Number($('time-slider').max), defaultDuration);
    assert.equal(Number($('history').attrs['aria-valuemax']), defaultDuration);
    $('history').fire('keydown', {key: 'End'});
    assert.equal(Number($('time-slider').value), defaultDuration, 'simulation ends at default duration');
    $('history').fire('keydown', {key: 'Home'});
    if (model === 'pendulum') {
      checkSecondBodyColor();
      const symbols = $('parameters').children.map(root => root.children[0].children[0].children[1].dataset.math);
      assert(symbols.includes('\\dot{\\theta}_{10}') && symbols.includes('\\dot{\\theta}_{20}'), 'both initial angular velocities have proper dotted theta symbols');
      $('duration').value = '25'; $('duration').fire('input'); tick();
      $('example-select').value = '1'; $('example-select').fire('change');
      $('param-omega1').value = '.2'; $('param-omega1').fire('input'); tick();
      assert.equal(Number($('time-slider').max), 25, 'explicit duration survives example and parameter changes');
      $('model-select').fire('change');
      assert.equal(Number($('time-slider').max), 10, 'selecting the double pendulum restores its default');
    }
    assert.equal($('position-badge').hidden, model === 'pendulum');
    assert.equal($('detail-row').hidden, model !== 'pendulum');
    assert.equal($('trail-row').hidden, model === 'oscillator');
    assert.equal($('velocity-row').hidden, model !== 'oscillator');
    assert.equal($('scene').dataset.velocity, 'false');
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
      for (const time of ['0', '1.234', String(defaultDuration - .001), String(defaultDuration)]) {
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
    $('duration').value = '60'; $('duration').fire('input'); tick();
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
  assert.equal(Number($('duration').value), 30, 'gravity keeps its original default');
  $('duration').value = '60'; $('duration').fire('input'); tick();
  assert($('friction-row').hidden && $('damping-controls').hidden && $('dissipation-card').hidden, 'gravity is an isolated two-body system');
  assert.equal($('friction-badge').textContent, 'Gravitation seule');
  checkSecondBodyColor();
  assert(!$('velocity-row').hidden, 'velocity option is available for gravity');
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
  checkGravityVelocityOptions();
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
  checkInitialDragging();
  assert.deepEqual(reported, []);
  console.log('Energy UI controllers: mouse/touch and keyboard initial-position editing for all four systems, constraints, preview/commit/cancel, playback locks, signed energies, LaTeX, examples, friction and chart seeking passed.');
}
function checkSecondBodyColor() {
  const body = sceneFills.find(fill => fill.color === '#74c9b2');
  assert(body, 'second body is filled with light turquoise');
  assert.equal(body.circle[0], parseFloat($('mass-handle-1').style.left));
  assert.equal(body.circle[1], parseFloat($('mass-handle-1').style.top));
  assert(sceneStrokes.some(stroke => stroke.color === '#499e88' && stroke.width === 1.25), 'thin darker outline keeps the pale mass visible');
  const massLabel = $('scene-labels').children.find(node => !node.hidden && node.dataset.math === 'm_2');
  assert.equal(massLabel.style.color, '#237a68', 'mathematical label retains darker readable ink');
  assert(sceneFills.some(fill => fill.color === '#2775b6'), 'first body stays blue');
}
function checkInitialDragging() {
  const near = (a,b) => assert(Math.abs(a-b) < 1e-7, `${a} vs ${b}`);
  const point = i => [parseFloat($('mass-handle-'+i).style.left), parseFloat($('mass-handle-'+i).style.top)];
  const parameter = key => Number($('param-'+key).value);
  const pointer = (i, name, xy, extra = {}) => {
    const rect = $('scene-canvas').getBoundingClientRect();
    $('mass-handle-'+i).fire(name, {pointerId: 7, isPrimary: true, button: 0, pointerType: 'touch', clientX: rect.left+xy[0], clientY: rect.top+xy[1], ...extra});
  };
  const drag = (i, target) => {
    const start = point(i);
    // Grabbing off-center must preserve the pointer offset, without a jump.
    pointer(i,'pointerdown',[start[0]+6,start[1]-4]);
    assert($('mass-handle-'+i).hasPointerCapture(7));
    const end = [target[0]+6,target[1]-4];
    pointer(i,'pointermove',end);
    return () => pointer(i,'pointerup',end);
  };
  $('friction-toggle').checked = false;
  $('duration').value = '5'; $('duration').fire('input'); tick();
  assert(css.includes('touch-action: none'), 'touch dragging does not pan the page');
  assert(html.includes('role="group"'), 'interactive masses are not hidden inside an image role');
  for (const viewport of [640,300]) {
    width = viewport;
    $('model-select').value = 'oscillator'; $('model-select').fire('change');
    assert(!$('mass-handle-0').hidden && $('mass-handle-1').hidden);
    $('param-v0').value = '1'; $('param-v0').fire('input'); tick();
    const mid = (44+width-28)/2, scaleX = (width-72)/(2*2.15);
    let release = drag(0,[mid+.5*scaleX,230]);
    near(parameter('x0'),.5); near(parameter('v0'),1);
    assert.equal($('total-readout').dataset.number,'1.000|\\mathrm J','energies update before release');
    near(point(0)[0],mid+.5*scaleX); near(point(0)[1],278);
    release(); assert(!$('mass-handle-0').hasPointerCapture(7));
    near(point(0)[0],mid+.5*scaleX);
    $('play').click(); assert($('mass-handle-0').hidden,'lock immediately when pressing Play');
    tick(1000); tick(1100); $('play').click();
    assert($('mass-handle-0').hidden,'paused later is not an initial state');
    assert.notEqual(parseFloat($('position-readout').dataset.number),.5,'full simulation rebuilt after release');
    const unchanged = parameter('x0');
    pointer(0,'pointerdown',point(0)); pointer(0,'pointermove',[30,100]); pointer(0,'pointerup',[30,100]);
    near(parameter('x0'),unchanged);
    $('restart').click(); assert(!$('mass-handle-0').hidden); near(parameter('x0'),.5);
    const beforeKey = parameter('x0'); $('mass-handle-0').fire('keydown',{key:'ArrowRight'});
    assert(parameter('x0') > beforeKey,'keyboard alternative');
    release = drag(0,[-1000,0]); near(parameter('x0'),-2); release();
    const beforeClick = parameter('x0'); pointer(0,'pointerdown',point(0)); pointer(0,'pointerup',point(0)); near(parameter('x0'),beforeClick);

    $('model-select').value = 'simple-pendulum'; $('model-select').fire('change');
    $('param-omega0').value = '1'; $('param-omega0').fire('input'); tick();
    const origin = [width/2-10,173], radius = Math.min((width-110)/2,100);
    release = drag(0,[origin[0]+radius,origin[1]]);
    near(parameter('theta0'),90); near(parameter('l'),1.2); near(parameter('omega0'),1);
    assert.equal($('total-readout').dataset.number,'12.492|\\mathrm J'); release();
    near(Math.hypot(point(0)[0]-origin[0],point(0)[1]-origin[1]),radius);
    drag(0,[origin[0]-radius,origin[1]]); near(parameter('theta0'),-90);
    pointer(0,'pointercancel',point(0)); near(parameter('theta0'),90);
    drag(0,[origin[0],origin[1]-radius]); near(Math.abs(parameter('theta0')),180);
    $('mass-handle-0').fire('keydown',{key:'Escape'}); near(parameter('theta0'),90);
    const theta = parameter('theta0'); pointer(0,'pointerdown',point(0),{button:2});
    pointer(0,'pointermove',[0,0]); near(parameter('theta0'),theta);

    $('model-select').value = 'pendulum'; $('model-select').fire('change');
    assert(!$('mass-handle-0').hidden && !$('mass-handle-1').hidden);
    const o = [width/2,185], scale = Math.min((width-80)/4.4,255/4.4);
    const oldA = point(0), oldB = point(1), arm = 1.2*scale/Math.sqrt(2);
    release = drag(0,[o[0]+arm,o[1]+arm]); near(parameter('theta1'),45); near(parameter('theta2'),-30);
    near(point(1)[0]-oldB[0],point(0)[0]-oldA[0]); near(point(1)[1]-oldB[1],point(0)[1]-oldA[1]); release();
    const a = point(0); release = drag(1,[a[0]-scale,a[1]]); near(parameter('theta2'),-90); near(parameter('theta1'),45); release();
    near(Math.hypot(point(1)[0]-point(0)[0],point(1)[1]-point(0)[1]),scale);

    $('model-select').value = 'gravity'; $('model-select').fire('change');
    const c = [width/2,173], gravityScale = Math.hypot(point(1)[0]-point(0)[0],point(1)[1]-point(0)[1])/10;
    release = drag(1,[c[0],c[1]-6*gravityScale]);
    near(parameter('r0'),12); near(parameter('phi0'),90); near(parameter('speedRatio'),1); release();
    near((point(0)[0]+point(1)[0])/2,c[0]); near((point(0)[1]+point(1)[1])/2,c[1]);
    near(point(1)[1],c[1]-6*gravityScale);
    release = drag(0,[c[0]-4*gravityScale,c[1]]); near(parameter('r0'),8); near(parameter('phi0'),0); release();
    const p = point(0); drag(0,[c[0]-3*gravityScale,c[1]]);
    pointer(0,'lostpointercapture',p); near(parameter('r0'),8);
    assert.equal($('example-select').value,'custom');
    $('time-slider').value = '1'; $('time-slider').fire('input'); assert($('mass-handle-0').hidden);
    $('restart').click(); assert(!$('mass-handle-0').hidden);
    // Switching models during a captured gesture must not leave stale handlers.
    drag(0,[c[0]-5*gravityScale,c[1]]);
    $('model-select').value = 'oscillator'; $('model-select').fire('change');
    pointer(0,'pointermove',[0,0]); near(parameter('x0'),1);
  }
  width = 640;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
