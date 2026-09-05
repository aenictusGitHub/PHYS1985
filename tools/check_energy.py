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
