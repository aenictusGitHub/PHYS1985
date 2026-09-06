"""Check the energy app's actual packaged physics (Node.js or macOS JavaScript).

Analytical oscillator checks, double-pendulum energy conservation, kinematics,
equilibrium, coupling, and off-grid scrubbing. No browser dependencies required.
"""
import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
from zipfile import ZipFile

PROJECT = Path(__file__).resolve().parent.parent
CHECKS = r'''
function assert(ok, message) { if (!ok) throw new Error(message); }
function near(a, b, eps, message) { assert(Math.abs(a - b) <= eps, message + ': ' + a + ' vs ' + b); }
const oscillator = {m: 1, k: 4, x0: 1, v0: 0};
const initial = EnergyModels.oscillator(oscillator, 0);
near(initial.E, 2, 1e-14, 'initial spring energy');
near(EnergyModels.oscillator(oscillator, Math.PI / 4).K, 2, 1e-13, 'quarter period K');
near(EnergyModels.oscillator(oscillator, Math.PI / 2).x, -1, 1e-13, 'half period x');
for (const p of [oscillator, {m: .2, k: 20, x0: -2, v0: 4}, {m: 5, k: .5, x0: 2, v0: -4}, {...oscillator, x0: 0, v0: 0}]) {
  const sim = EnergyModels.simulate('oscillator', p, 60);
  const E = .5 * p.m * p.v0 ** 2 + .5 * p.k * p.x0 ** 2;
  for (const s of sim.samples) {
    near(s.E, E, 1e-11, 'oscillator conservation');
    assert(s.K >= 0 && s.U >= 0, 'positive energy');
  }
  near(sim.at(3.4567).E, E, 1e-11, 'oscillator continuous time');
}
const pendulum = {m1: 1, m2: 1, l1: 1.2, l2: 1, theta1: 120, theta2: -30, omega1: 0, omega2: 0, g: 9.81};
const simple = {m: 1, l: 1.2, theta0: 15, omega0: 0, g: 9.81};
const simpleCases = [simple, {...simple, theta0: 120}, {...simple, theta0: 0, omega0: 7},
  {...simple, theta0: 0}, {...simple, m: .2, l: .5, g: 20, theta0: 170, omega0: -8},
  {...simple, m: 5, l: 2.5, g: .5, theta0: -170, omega0: 8}];
for (const [i, p] of simpleCases.entries()) {
  const sim = EnergyModels.simulate('simple-pendulum', p, 60), E0 = sim.samples[0].E;
  assert(sim.maxError < 1e-7 * Math.max(1, E0), 'simple pendulum energy conservation');
  for (const s of sim.samples) {
    near(Math.hypot(s.x, s.z), p.l, 1e-12, 'simple pendulum rigid rod');
    near(s.K, .5*p.m*p.l*p.l*s.omega*s.omega, 1e-10, 'simple kinetic energy');
    near(s.U, p.m*p.g*(s.z+p.l), 1e-10, 'gravitational potential from height');
    assert(s.K >= 0 && s.U >= 0, 'nonnegative pendulum energies');
  }
  for (const t of [0, .0034, 1.2345, 26.54321, 59.999, 60]) near(sim.at(t).E, E0, 1e-7*Math.max(1,E0), 'simple off-grid conservation');
  if (i === 2) assert(sim.at(10).theta > 2*Math.PI && sim.samples.every(s => s.omega > 0), 'rotations are not folded or stopped');
  if (i === 3) assert(sim.samples.every(s => s.E === 0 && s.y.every(v => v === 0)), 'simple exact rest');
}
// Small-angle limit and the amplitude-dependent period of the full equation.
const smallAngle = EnergyModels.simulate('simple-pendulum', {...simple, theta0: .01}, 5);
const halfPeriod = Math.PI * Math.sqrt(simple.l/simple.g);
near(smallAngle.at(halfPeriod).theta, -.01*Math.PI/180, 1e-10, 'small-angle half period');
const largeAngle = EnergyModels.simulate('simple-pendulum', {...simple, theta0: 120}, 5);
assert(largeAngle.at(halfPeriod).theta > -119*Math.PI/180, 'large oscillation is not linearized');
for (const gamma of [0,.7]) {
  const p = {...simple, gamma}, y = [1.3,-2.7,0], d = EnergyModels.simplePendulumRhs(p,y), h = 1e-6;
  const sample = EnergyModels.simplePendulum(p,y,0);
  const a = EnergyModels.simplePendulum(p,y.map((v,i) => v+h*d[i]),0).E;
  const b = EnergyModels.simplePendulum(p,y.map((v,i) => v-h*d[i]),0).E;
  near((a-b)/(2*h), -2*gamma*sample.K, 1e-7, 'simple instantaneous energy balance');
  near(d[2], 2*gamma*sample.K, 1e-10, 'simple independently integrated dissipation');
}
console.log('Simple pendulum: small-angle limit, nonlinear oscillations, full rotations, rigid rod, energy, dissipation and off-grid scrubbing passed.');
const gravity = {m1: 1e12, m2: 1e12, r0: 10, speedRatio: 1};
let gravityError = 0;
for (const p of [gravity, {...gravity, speedRatio: .65}, {...gravity, m1: 5e12, m2: .2e12},
  {...gravity, speedRatio: 1.6}, {...gravity, m1: 5e12, m2: 5e12, r0: 6, speedRatio: .5},
  {...gravity, m1: .2e12, m2: .2e12, r0: 20, speedRatio: 1.8}]) {
  const sim = EnergyModels.simulate('gravity', p, 60), initial = sim.samples[0];
  const reference = initial.K + Math.abs(initial.U), totalMass = p.m1 + p.m2;
  const angular0 = initial.y[0]*initial.y[3] - initial.y[1]*initial.y[2];
  const error = sim.maxError/reference; gravityError = Math.max(gravityError,error);
  assert(error < 1e-7, 'two-body energy conservation');
  for (const s of sim.samples) {
    assert(s.U < 0 && s.K > 0 && s.D === 0 && s.r > 0, 'correct signed gravitational energies');
    near(s.parts.reduce((a,b)=>a+b,0), s.E, reference*1e-14, 'pair potential counted once');
    near((p.m1*s.x1+p.m2*s.x2)/totalMass, 0, 1e-12, 'fixed barycenter x');
    near((p.m1*s.z1+p.m2*s.z2)/totalMass, 0, 1e-12, 'fixed barycenter z');
    near((p.m1*s.vx1+p.m2*s.vx2)/totalMass, 0, 1e-12, 'zero total horizontal momentum');
    near((p.m1*s.vz1+p.m2*s.vz2)/totalMass, 0, 1e-12, 'zero total vertical momentum');
    near(s.vx2-s.vx1, s.y[2], 1e-12, 'relative horizontal velocity');
    near(s.vz2-s.vz1, s.y[3], 1e-12, 'relative vertical velocity');
    near(.5*p.m1*(s.vx1*s.vx1+s.vz1*s.vz1), s.parts[0], reference*1e-14, 'first velocity matches kinetic energy');
    near(.5*p.m2*(s.vx2*s.vx2+s.vz2*s.vz2), s.parts[1], reference*1e-14, 'second velocity matches kinetic energy');
    near(Math.hypot(s.x2-s.x1,s.z2-s.z1), s.r, 1e-10, 'relative separation');
    near(s.y[0]*s.y[3]-s.y[1]*s.y[2], angular0, 1e-7*Math.abs(angular0), 'angular momentum conservation');
    near(s.U, -EnergyModels.G*p.m1*p.m2/s.r, reference*1e-14, 'unsoftened Newtonian potential');
  }
  for (const t of [.0034,1.2345,26.54321,59.999,60]) near(sim.at(t).E,initial.E,reference*1e-7,'gravitational off-grid energy');
  const t = 1.2345, dt = 1e-5, before = sim.at(t-dt), after = sim.at(t+dt), current = sim.at(t);
  for (const i of [1,2]) {
    near((after['x'+i]-before['x'+i])/(2*dt), current['vx'+i], 1e-6, 'body horizontal velocity is position derivative');
    near((after['z'+i]-before['z'+i])/(2*dt), current['vz'+i], 1e-6, 'body vertical velocity is position derivative');
  }
  const q2 = p.speedRatio*p.speedRatio, semiMajor = p.r0/(2-q2);
  if (q2 < 2) assert(initial.E < 0, 'bound orbits have negative energy');
  else assert(initial.E > 0 && sim.at(60).r > p.r0*2, 'unbound orbit escapes');
  if (p.speedRatio === 1) {
    const period = 2*Math.PI*Math.sqrt(p.r0**3/(EnergyModels.G*totalMass));
    near(sim.at(period/4).y[0], 0, 1e-7, 'circular quarter-period phase');
    near(sim.at(period/4).y[1], p.r0, 1e-7, 'circular quarter-period radius');
    near(sim.at(period).y[0], p.r0, 1e-7, 'closed Kepler circle');
    for (const s of sim.samples) near(s.r,p.r0,1e-7,'constant circle separation');
  } else if (q2 < 1) {
    const period = 2*Math.PI*Math.sqrt(semiMajor**3/(EnergyModels.G*totalMass));
    near(sim.at(period/2).r, p.r0*q2/(2-q2), 1e-7, 'elliptical periapsis');
  }
}
for (const y of [[10,3,.5,2],[-4,5,-3,1]]) {
  const d = EnergyModels.gravityRhs(gravity,y), mu = EnergyModels.G*(gravity.m1+gravity.m2), r = Math.hypot(y[0],y[1]);
  near(Math.hypot(d[2],d[3]),mu/r**2,1e-12,'inverse-square attraction');
  const gradDot = EnergyModels.G*gravity.m1*gravity.m2*(y[0]*y[2]+y[1]*y[3])/r**3;
  const reducedMass = gravity.m1*gravity.m2/(gravity.m1+gravity.m2);
  near(reducedMass*(y[2]*d[2]+y[3]*d[3])+gradDot,0,.001,'instantaneous gravitational energy balance');
}
console.log('Universal gravitation: circular and elliptical Kepler references, escape, signed energy, fixed barycenter, angular momentum and inverse-square force passed. Maximum relative energy error: '+gravityError);
const unrotated = EnergyModels.simulate('gravity', {...gravity,speedRatio:.65}, 5);
for (const phi0 of [-90,47,180]) {
  const rotated = EnergyModels.simulate('gravity', {...gravity,speedRatio:.65,phi0}, 5), phi = phi0*Math.PI/180;
  for (const t of [0,.13,1.234,5]) {
    const a = unrotated.at(t), b = rotated.at(t);
    near(b.y[0],a.y[0]*Math.cos(phi)-a.y[1]*Math.sin(phi),1e-7,'initial orbital orientation x');
    near(b.y[1],a.y[0]*Math.sin(phi)+a.y[1]*Math.cos(phi),1e-7,'initial orbital orientation z');
    near(b.E,a.E,1e-7*(a.K+Math.abs(a.U)),'rotation preserves energies and tangential initial velocity');
  }
}
let maxRelative = 0;
const cases = [
  pendulum,
  {...pendulum, theta1: 15, theta2: 0},
  {...pendulum, m1: 2, m2: .5, theta1: 90, theta2: -60},
  {...pendulum, theta1: 0, theta2: 0},
  {...pendulum, m1: .2, m2: 5, l1: .5, l2: .5, g: 20, theta1: 170, theta2: -170, omega1: 3, omega2: -3},
  {...pendulum, m1: 5, m2: .2, l1: 2, l2: .5, g: 20, theta1: 170, theta2: -90, omega1: -3, omega2: 3},
  {...pendulum, m1: .2, m2: 5, l1: .5, l2: 2, g: .5, theta1: -150, theta2: 130, omega1: 3, omega2: -3},
];
for (const [i, p] of cases.entries()) {
  const sim = EnergyModels.simulate('pendulum', p, 60);
  const E0 = sim.samples[0].E, relative = sim.maxError / Math.max(1, E0);
  maxRelative = Math.max(maxRelative, relative);
  assert(relative < 1e-5, 'pendulum case ' + i + ' relative drift ' + relative);
  for (const s of sim.samples) {
    assert(s.parts.every(v => Number.isFinite(v) && v >= 0), 'finite nonnegative energies');
    near(s.parts.reduce((a,b) => a+b, 0), s.E, 1e-10, 'energy decomposition');
    near(Math.hypot(s.x1, s.z1), p.l1, 1e-12, 'first rigid rod');
    near(Math.hypot(s.x2-s.x1, s.z2-s.z1), p.l2, 1e-12, 'second rigid rod');
  }
  for (const t of [0, .0034, 1.2345, 26.54321, 59.999, 60]) {
    const s = sim.at(t);
    near(s.E, E0, 1e-5 * Math.max(1, E0), 'scrubbing conservation');
  }
  if (i === 3) assert(sim.samples.every(s => s.E === 0 && s.y.every(v => v === 0)), 'exact equilibrium');
  if (i === 0) {
    const firstMassEnergy = s => s.parts[0] + s.parts[1];
    assert(Math.abs(firstMassEnergy(sim.at(1)) - firstMassEnergy(sim.at(0))) > .1, 'exchange between masses');
  }
}
// Numerical derivative of E dotted with the ODE must vanish (not just along a special trajectory).
for (const y of [[.4, -.8, .5, 1.2], [2.7, 1.1, -2, 3], [0, 0, 1, -1]]) {
  const d = EnergyModels.rhs(pendulum, y), h = 1e-6;
  const a = EnergyModels.pendulum(pendulum, y.map((v,i)=>v+h*d[i]), 0).E;
  const b = EnergyModels.pendulum(pendulum, y.map((v,i)=>v-h*d[i]), 0).E;
  near((a-b)/(2*h), 0, 1e-6, 'instantaneous dE/dt');
}
console.log('Energy: analytical oscillator, rigid rods, equilibrium, mass coupling, full-range cases and continuous scrubbing passed. Maximum relative drift over 60 s: ' + maxRelative);

// Independently integrated dissipated work must balance the mechanical loss.
let maxDampedError = 0;
for (const [model, parameters] of [
  ['oscillator', oscillator], ['oscillator', {m: .2, k: 20, x0: -2, v0: 4}],
  ['oscillator', {...oscillator, x0: 0, v0: 0}],
  ['pendulum', pendulum], ['pendulum', cases[4]], ['pendulum', cases[3]],
  ...simpleCases.map(p => ['simple-pendulum', p]),
]) {
  for (const gamma of [.01, .25, 2]) {
    const p = {...parameters, gamma}, sim = EnergyModels.simulate(model, p, 60);
    const E0 = sim.samples[0].E, tolerance = 1e-6 * Math.max(1, E0);
    let previousE = E0, previousD = 0;
    for (const s of sim.samples) {
      assert(s.E <= previousE + tolerance, 'mechanical energy cannot grow with friction');
      assert(s.D >= previousD - tolerance && s.D >= -1e-10, 'dissipated energy cannot decrease');
      near(s.E + s.D, E0, tolerance, 'mechanical plus dissipated balance');
      previousE = s.E; previousD = s.D;
    }
    for (const t of [0, .0034, 1.2345, 26.54321, 59.999, 60]) {
      const s = sim.at(t); near(s.E + s.D, E0, tolerance, 'damped off-grid balance');
    }
    maxDampedError = Math.max(maxDampedError, sim.maxError / Math.max(1, E0));
    if (E0 === 0) assert(sim.samples.every(s => s.D === 0 && s.E === 0), 'no dissipation at rest');
    else assert(sim.at(60).E < E0 && sim.at(60).D > 0, 'friction actually damps the motion');
  }
}
// Exact underdamped, critically damped and overdamped oscillator references.
function dampedReference(p, t) {
  const a = p.gamma / 2, omega2 = p.k / p.m, discriminant = a * a - omega2;
  if (Math.abs(discriminant) < 1e-12) {
    const b = p.v0 + a * p.x0, q = p.x0 + b * t, factor = Math.exp(-a * t);
    return {x: factor * q, v: factor * (b - a * q)};
  }
  if (discriminant < 0) {
    const w = Math.sqrt(-discriminant), b = (p.v0 + a * p.x0) / w;
    const q = p.x0 * Math.cos(w*t) + b * Math.sin(w*t);
    const dq = w * (-p.x0 * Math.sin(w*t) + b * Math.cos(w*t));
    return {x: Math.exp(-a*t) * q, v: Math.exp(-a*t) * (dq-a*q)};
  }
  const r1 = -a + Math.sqrt(discriminant), r2 = -a - Math.sqrt(discriminant);
  const c1 = (p.v0-r2*p.x0)/(r1-r2), c2 = p.x0-c1;
  return {x: c1*Math.exp(r1*t)+c2*Math.exp(r2*t), v: r1*c1*Math.exp(r1*t)+r2*c2*Math.exp(r2*t)};
}
for (const p of [{m:1,k:1,x0:1,v0:.3,gamma:.4}, {m:1,k:1,x0:1,v0:.3,gamma:2}, {m:4,k:1,x0:1,v0:-.3,gamma:2}]) {
  const sim = EnergyModels.simulate('oscillator', p, 60);
  for (const t of [0,.03,.5,1.2345,5,15,60]) {
    const expected = dampedReference(p,t), actual = sim.at(t);
    near(actual.x, expected.x, 1e-8, 'damped analytical position');
    near(actual.v, expected.v, 1e-8, 'damped analytical velocity');
  }
}
for (const y of [[.4,-.8,.5,1.2,0], [2.7,1.1,-2,3,0]]) {
  const p = {...pendulum,gamma:.7}, d = EnergyModels.rhs(p,y), h = 1e-6;
  const sample = EnergyModels.pendulum(p,y,0);
  const a = EnergyModels.pendulum(p,y.map((v,i)=>v+h*d[i]),0).E;
  const b = EnergyModels.pendulum(p,y.map((v,i)=>v-h*d[i]),0).E;
  near((a-b)/(2*h), -2*p.gamma*sample.K, 1e-6, 'viscous dissipative power');
  near(d[4], 2*p.gamma*sample.K, 1e-10, 'independent dissipated work derivative');
}
console.log('Friction: all damping regimes, monotone loss, dissipated work, rest, extreme parameters and scrubbing passed. Maximum relative balance error over 60 s: ' + maxDampedError);
'''

with ZipFile(PROJECT / 'energie_mecanique_webapp_fr.zip') as archive:
    assert archive.testzip() is None
    source_path = next(p for p in archive.namelist() if p.endswith('/app.js'))
    source = archive.read(source_path).decode()
    html = archive.read(source_path.replace('/app.js', '/index.html')).decode()
    assert 'data-app="conservation"' in html
    assert 'fontCache: \'none\'' in html
pure = source.split('// The same file works')[0]
runtime = os.environ.get('PHYS1985_NODE') or shutil.which('node')
command = [runtime] if runtime else ['osascript', '-l', 'JavaScript']
with TemporaryDirectory(prefix='phys1985-energy-check-') as folder:
    script = Path(folder) / 'check.js'
    script.write_text(pure + CHECKS)
    subprocess.run(command + [str(script)], check=True)
