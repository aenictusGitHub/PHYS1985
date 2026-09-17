/* Checks the real packaged code without browser automation.
 * Run: node tools/check_osculating.cjs */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const project = path.join(__dirname, '..');
const close = (a, b, tolerance = 1e-7) => assert(Math.abs(a - b) <= tolerance,
  'Expected ' + b + ', got ' + a);

function load(dimensions) {
  const name = 'cinematique_' + dimensions + 'd_webapp_fr';
  const zip = path.join(project, name + '.zip');
  const entry = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    .split('\n').find(file => /^[^/]+\/app\.js$/.test(file));
  const read = file => execFileSync('unzip', ['-p', zip, entry.replace('app.js', file)], { encoding: 'utf8' });
  const source = read('app.js'), html = read('index.html'), css = read('style.css');
  new vm.Script(source);
  assert(!/<input id="osculating-toggle"[^>]*\bchecked\b/.test(html), 'Opt-in by default');
  for (const id of ['osculating-toggle', 'curvature-details', 'curvature-value', 'curvature-digits',
    'curvature-scientific', 'curvature-exponent', 'curvature-status', 'radius-label']) {
    assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id);
    assert(source.includes("document.getElementById('" + id + "')"), id + ' is wired');
  }
  assert(html.includes(String.raw`\(R_c\)`));
  assert(!html.includes(String.raw`R_c=|\vec v|^2/|\vec a_c|`));
  assert(html.includes('Le cercle osculateur est le cercle qui épouse le mieux la courbe localement.'));
  assert(!html.includes(String.raw`\rho`));
  assert(css.includes('.curvature-radius-label[hidden]'));
  assert(source.includes("dom.osculating.addEventListener('change', updateAndDraw)"));
  const fn = name => {
    const start = source.indexOf('  function ' + name + '(');
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n  }\n', start) + 5) + '\n';
  };
  assert(fn('drawScene').indexOf('drawOsculatingCircle') < fn('drawScene').indexOf('drawParticle'));
  assert(!/vectorScale|resetCamera|resetView/.test(fn('drawOsculatingCircle')));
  let pure = source.slice(0, source.indexOf("  const viewport = document.getElementById('viewport');"));
  if (dimensions === 2) pure += source.slice(source.indexOf('  function positionAt('), source.indexOf('  function clipToPlot('));
  pure += String.raw`
    const commands = [];
    const ctx = new Proxy({}, { get: (target, key) => (...args) => {
      for (const value of args) if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new Error(key + ': nonfinite coordinate');
      }
      commands.push([key, ...args]);
    }});
    const element = () => ({ hidden: true, checked: false, style: {}, dataset: {},
      setAttribute(key, value) { this[key] = value; } });
    const dom = Object.fromEntries(['osculating', 'curvatureDetails', 'curvatureValue',
      'curvatureDigits', 'curvatureScientific', 'curvatureExponent', 'curvatureStatus', 'radiusLabel']
      .map(key => [key, element()]));
    const setMathDigits = (element, value) => { element.textContent = String(value); };
    const state = { vectorScale: 1, time: 1.25, playing: true };
    let viewportWidth = 900, viewportHeight = 700;
  `;
  if (dimensions === 2) {
    pure += String.raw`
      const view = { ...DEFAULT_VIEW };
      const plotRect = { left: 110, right: 710, top: 45, bottom: 645, width: 600, height: 600 };
    `;
    pure += fn('worldToScreen') + fn('clipToPlot') + fn('drawArrow');
    assert(!/255,255,255|ctx\.stroke\(/.test(fn('drawArrow')), 'No white seam at the arrowhead');
  } else {
    pure += source.match(/  const camera = \{[\s\S]*?\n  \};/)[0] + '\n';
    pure += fn('cameraBasis') + fn('projectWorld') + source.match(/  const projectPhysical = [^\n]+/)[0] + '\n';
  }
  pure += fn('updateCurvatureReadout') + fn('drawRadiusAnnotation') + fn('drawOsculatingCircle');
  pure += `
    return { V, add, sub, scale, dot, norm, TRAJECTORIES, derivatives,
      osculatingGeometry, osculatingPoint, clipScreenSegment, dom, commands, state,
      frame: FRAME,
      resize(w, h) { viewportWidth = w; viewportHeight = h; },
      render(data) {
        commands.length = 0;
        const circle = updateCurvatureReadout(data);
        drawOsculatingCircle(circle SUFFIX);
        return commands;
      },
      drawGeometry(circle) {
        commands.length = 0;
        drawOsculatingCircle(circle SUFFIX);
        return commands;
      },
      drawTestArrow(v) {
        commands.length = 0;
        if (typeof drawArrow === 'function') drawArrow(V(4, 4), v, 1, '#2775b6');
        return commands;
      },
      project: PROJECT
    };
  })();`.replaceAll('FRAME', dimensions === 2 ? 'view' : 'camera')
    .replaceAll('SUFFIX', dimensions === 2 ? '' : ', cameraBasis()')
    .replaceAll('PROJECT', dimensions === 2 ? 'worldToScreen' : '(p) => projectPhysical(p, cameraBasis())');
  const app = vm.runInNewContext(pure);
  const standalone = fs.readFileSync(path.join(project, name + '.html'), 'utf8');
  assert(standalone.includes(source), 'Archive and standalone must match');
  return app;
}

for (const dimensions of [2, 3]) {
  const app = load(dimensions);
  const { V, add, sub, scale, dot, norm, osculatingGeometry: geometry, osculatingPoint: point } = app;
  const fixtureScale = dimensions === 3 ? 1/2000 : 1/500;
  const metric = v => scale(v,fixtureScale);
  const data = Object.fromEntries(Object.entries({
    position: V(3000, 2000, 2000), velocity: V(0, 100, 0),
    acceleration: V(-10, 7, 0), // Tangential acceleration must not change the radius.
  }).map(([name,vector])=>[name,metric(vector)]));
  const circle = geometry(data);
  if (dimensions === 2) {
    for (const length of [21, 35, 200, 1500]) for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8, v = metric(V(length * Math.cos(angle), length * Math.sin(angle)));
      const commands = app.drawTestArrow(v);
      assert.equal(commands.filter(c => c[0] === 'beginPath').length, 1);
      assert.equal(commands.filter(c => c[0] === 'fill').length, 1);
      assert.equal(commands.filter(c => c[0] === 'stroke').length, 0);
      const vertices = commands.filter(c => c[0] === 'moveTo' || c[0] === 'lineTo').map(c => V(c[1], c[2]));
      const a = app.project(V(4, 4)), b = app.project(add(V(4, 4), v)), d = sub(b, a), magnitude = norm(d);
      assert.equal(vertices.length, 7, 'Single connected shaft and swept head');
      close(norm(sub(vertices[3], b)), 0);
      for (const p of vertices) {
        const projection = dot(sub(p, a), scale(d, 1 / magnitude));
        assert(projection >= -1e-7 && projection <= magnitude + 1e-7, 'Short arrows do not extend backwards');
      }
    }
    assert.equal(app.drawTestArrow(V()).length, 0);
  }
  assert(circle.defined);
  close(circle.radius, 1000*fixtureScale);
  close(norm(sub(circle.center, metric(V(2000, 2000, 2000)))), 0);
  close(dot(circle.tangent, circle.normal), 0);
  close(norm(sub(point(circle, 0), data.position)), 0);
  for (let i = 0; i <= 64; i++) {
    close(norm(sub(point(circle, i * Math.PI / 32), circle.center)), circle.radius, 1e-8);
  }
  const tangent = scale(sub(point(circle, 1e-5), point(circle, -1e-5)), 1 / (2e-5 * circle.radius));
  close(norm(sub(tangent, circle.tangent)), 0, 1e-8);
  const reversed = geometry({ ...data, velocity: scale(data.velocity, -1) });
  close(norm(sub(reversed.center, circle.center)), 0);
  close(reversed.radius, circle.radius);
  const faster = geometry({ ...data, velocity: scale(data.velocity, 2), acceleration: scale(data.acceleration, 4) });
  close(faster.radius, circle.radius);
  assert.equal(geometry({ ...data, velocity: V() }).reason, 'stationary');
  assert.equal(geometry({ ...data, acceleration: V() }).reason, 'straight');
  assert.equal(geometry({ ...data, acceleration: V(0, 7, 0) }).reason, 'straight');
  assert.equal(geometry({ ...data, acceleration: V(1e-7, 7, 0) }).reason, 'straight');
  assert(!geometry({ ...data, velocity: V(NaN, 1, 0) }).defined);
  const parabola = geometry({ position: V(1, 1, 0), velocity: V(1, 2, 0), acceleration: V(0, 2, 0) });
  close(parabola.radius, 5 ** 1.5 / 2);
  if (dimensions === 3) {
    const a = 1000, b = 400;
    const helix = geometry({ position: V(a, 0, 0), velocity: V(0, a, b), acceleration: V(-a, 0, 0) });
    close(helix.radius, (a * a + b * b) / a);
    for (let i = 0; i < 32; i++) {
      close(dot(sub(point(helix, i / 32 * 2 * Math.PI), helix.position), V(0, -b, a)), 0, 1e-6);
    }
  }
  const mcua = app.TRAJECTORIES.mc || app.TRAJECTORIES.mcua;
  for (const t of [0, .1, 2, 5, mcua.duration]) {
    const c = geometry(app.derivatives(mcua, t));
    assert(c.defined);
    const expected = dimensions === 2 ? 2 : 1;
    close(c.radius, expected, expected * .002);
  }
  const rest = { closed: false, duration: 10, position: () => V(2000, 2000, 2000) };
  assert.equal(geometry(app.derivatives(rest, 4)).reason, 'stationary');
  const line = { closed: false, duration: 10, position: t => metric(V(2000 + t * 100, 2000 + t * 50, 2000 + t * 20)) };
  assert.equal(geometry(app.derivatives(line, 4)).reason, 'straight');
  const inflection = { closed: false, duration: 10, position: t => metric(V(2000 + (t - 5) * 100, 2000 + (t - 5) ** 3 * 10, 2000)) };
  assert.equal(geometry(app.derivatives(inflection, 5)).reason, 'straight');
  assert(geometry(app.derivatives(inflection, 4.9)).defined);
  assert(geometry(app.derivatives(inflection, 5.1)).defined);

  const before = JSON.stringify({ frame: app.frame, state: app.state });
  assert.equal(app.render(data).length, 0);
  assert(app.dom.curvatureDetails.hidden && app.dom.radiusLabel.hidden);
  app.dom.osculating.checked = true;
  const regularCommands = JSON.stringify(app.render(data));
  assert(app.commands.some(c => c[0] === 'lineTo'));
  assert.equal(app.dom.curvatureDigits.textContent, (1000*fixtureScale).toFixed(2));
  assert(!app.dom.curvatureValue.hidden && !app.dom.curvatureDetails.hidden);
  assert(app.dom.curvatureStatus.hidden && app.dom.curvatureScientific.hidden);
  assert.equal(JSON.stringify({ frame: app.frame, state: app.state }), before);
  app.state.vectorScale = 5;
  assert.equal(JSON.stringify(app.render(data)), regularCommands, 'Independent of vector display scale');
  app.render({ ...data, acceleration: V() });
  assert(app.dom.curvatureValue.hidden && !app.dom.curvatureStatus.hidden && app.dom.radiusLabel.hidden);
  assert.equal(app.commands.length, 0);
  app.render({ ...data, velocity: V() });
  assert(app.dom.curvatureStatus.textContent.includes('Vitesse quasi nulle'));
  app.render({ ...data, velocity: V(0,100,0), acceleration: V(-.001, 0, 0) });
  assert(!app.dom.curvatureScientific.hidden);
  assert.equal(app.dom.curvatureExponent.textContent, '7');
  app.render(data);
  assert(app.dom.curvatureScientific.hidden, 'No stale exponent');

  let maximumCommands = 0;
  for (const radius of [0.1, 10, 1000, 1e5, 1e8, 1e11]) {
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      const normal = V(Math.cos(angle), dimensions === 2 ? Math.sin(angle) : 0,
        dimensions === 3 ? Math.sin(angle) : 0);
      const c = { ...circle, radius, normal, center: add(circle.position, scale(normal, radius)) };
      c.tangent = dimensions === 2 ? V(-Math.sin(angle), Math.cos(angle)) : V(0, 1, 0);
      app.drawGeometry(c);
      maximumCommands = Math.max(maximumCommands, app.commands.length);
      assert(app.commands.length < 5000, 'Bounded rendering work');
      if (dimensions === 3) {
        for (const [command, x, y] of app.commands) if (command === 'lineTo' || command === 'moveTo') {
          assert(x >= -.01 && x <= 900.01 && y >= -.01 && y <= 700.01, 'Clipped to viewport');
        }
      }
    }
  }
  if (dimensions === 3) {
    for (const [width, height] of [[360, 520], [1800, 1000]]) {
      app.resize(width, height);
      for (const yaw of [-2, 0, 1.8]) for (const pitch of [-1.1, 0, 1.1]) {
        app.frame.yaw = yaw; app.frame.pitch = pitch;
        app.render(data);
        assert(app.commands.some(c => c[0] === 'lineTo'), 'Camera rotation and responsive resize');
      }
    }
    app.resize(900, 700);
  }
  let valid = 0, singular = 0;
  for (const item of Object.values(app.TRAJECTORIES)) {
    for (let i = 0; i <= 96; i++) {
      const d = app.derivatives(item, item.duration * i / 96), c = geometry(d);
      if (!c.defined) { singular++; continue; }
      valid++;
      assert(c.radius > 0 && Number.isFinite(c.radius));
      assert(Object.values(c.center).every(Number.isFinite));
      close(norm(sub(c.center, c.position)), c.radius, Math.max(1e-6, c.radius * 1e-12));
      close(dot(c.tangent, c.normal), 0, 1e-5);
      app.render(d);
    }
  }
  app.dom.osculating.checked = false;
  assert.equal(app.render(data).length, 0);
  assert(app.dom.curvatureDetails.hidden && app.dom.radiusLabel.hidden);
  console.log(dimensions + 'D passed: geometry, tangency, degenerate states, readouts, opt-in, projection, '
    + valid + ' regular / ' + singular + ' singular samples; max ' + maximumCommands + ' canvas commands.');
}
console.log('Osculating circles and R_c checked in both standalone apps and archives.');
