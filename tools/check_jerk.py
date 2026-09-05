"""Run analytical jerk checks against the actual packaged application code.

Requires Node.js or, on macOS, the system JavaScript runner (osascript).
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile
import shutil
import subprocess
import re

PROJECT = Path(__file__).resolve().parent.parent
CASES = ((2, 'cinematique_2d_webapp_fr'), (3, 'cinematique_3d_webapp_fr'))
CHECKS = r'''
  function assert(condition, message) { if (!condition) throw new Error(message); }
  function close(actual, expected, tolerance, label) {
    for (const axis of Object.keys(actual)) {
      assert(Number.isFinite(actual[axis]), label + ': non-finite ' + axis);
      assert(Math.abs(actual[axis] - expected[axis]) < tolerance,
        label + ': ' + axis + ' expected ' + expected[axis] + ', got ' + actual[axis]);
    }
  }
  const lissajousKeys = dimensions === 2 ? ['lissajous2', 'lissajous3'] : ['lissajous', 'lissajous3'];
  lissajousKeys.forEach((key, index) => {
    const item = TRAJECTORIES[key];
    const n = index + 2;
    const w = PARAMETERS.omega;
    const R = PARAMETERS.R;
    for (const t of [0, 0.004, 0.37, item.duration - 0.001, item.duration, 2 * item.duration]) {
      const expected = V(R * w ** 3 * Math.sin(w * t), -R * (n * w) ** 3 * Math.cos(n * w * t),
        -R * (1.5 * n * w) ** 3 * Math.cos(1.5 * n * w * t));
      close(jerkAt(item, t), expected, 0.001, key + ' raw @ ' + t);
      close(derivatives(item, t).jerk, expected, 0.001, key + ' display @ ' + t);
    }
  });
  const mcua = TRAJECTORIES.mcua;
  for (const t of [0, 0.5, 5, mcua.duration]) {
    const R = PARAMETERS.R;
    const alpha = PARAMETERS.alpha;
    const w = PARAMETERS.omega + alpha * t;
    const phi = PARAMETERS.omega * t + 0.5 * alpha * t * t;
    close(derivatives(mcua, t).jerk,
      V(R * (w ** 3 * Math.sin(phi) - 3 * w * alpha * Math.cos(phi)),
        R * (-(w ** 3) * Math.cos(phi) - 3 * w * alpha * Math.sin(phi)), 0),
      0.001, 'accelerated circle @ ' + t);
  }
  for (const t of [0, 0.001, 5, TRAJECTORIES.ballistic.duration]) {
    assert(norm(derivatives(TRAJECTORIES.ballistic, t).jerk) === 0, 'ballistic must be exactly zero');
  }
  const polynomial = { position: t => V(2000 + t ** 3, 4000 - 2 * t ** 3, 1000 + 3 * t ** 3) };
  for (const t of [0, 0.5, 7]) close(jerkAt(polynomial, t), V(6, -12, 18), 0.001, 'cubic polynomial');
  const fast = { position: t => V(2000 + 440 * Math.sin(8 * t), 2000 + 440 * Math.cos(8 * t), 0) };
  for (const t of [0, 0.08, 0.5]) close(jerkAt(fast, t),
    V(-440 * 8 ** 3 * Math.cos(8 * t), 440 * 8 ** 3 * Math.sin(8 * t), 0), 0.03, 'fast oscillation');
  for (const [key, item] of Object.entries(TRAJECTORIES)) {
    const displayScale = jerkDisplayScale(item);
    assert(Number.isFinite(displayScale) && displayScale > 0, key + ': invalid arrow scale');
    assert(displayScale === jerkDisplayScale(item), key + ': arrow scale must be fixed');
    for (let i = 0; i <= 96; i += 1) {
      const jerk = derivatives(item, item.duration * i / 96).jerk;
      assert(Object.values(jerk).every(Number.isFinite), key + ': non-finite jerk');
    }
  }
  console.log(dimensions + 'D: analytic references, endpoints, zero jerk, and all ' + Object.keys(TRAJECTORIES).length + ' trajectories passed.');
})();
'''

runtime = shutil.which('node')
command = [runtime] if runtime else ['osascript', '-l', 'JavaScript']
with TemporaryDirectory(prefix='phys1985-jerk-check-') as directory:
    for dimensions, name in CASES:
        with ZipFile(PROJECT / f'{name}.zip') as archive:
            assert archive.testzip() is None
            app_file = next(path for path in archive.namelist() if path.endswith('/app.js'))
            source = archive.read(app_file).decode()
            html = archive.read(app_file.replace('/app.js', '/index.html')).decode()
        assert 'id="toggle-jerk"' in html
        last_acceleration = 'centripetal' if dimensions == 2 else 'normal'
        assert html.index('id="toggle-jerk"') > html.index(f'id="toggle-{last_acceleration}"')
        metadata = source[source.index('  const VECTOR_META ='):source.index('  const readoutElements =')]
        assert metadata.index('    jerk:') > metadata.index(f'    {last_acceleration}:')
        toggles = re.search(r'    toggles: \{(.*?)\n    \}', source, re.S).group(1)
        readouts = re.search(r'function updateReadouts\(data\) \{\s*const vectors = \{(.*?)\n    \}', source, re.S).group(1)
        presets = re.search(r'function applyVectorPreset\(name\) \{\s*const selected = \{(.*?)\n    \}', source, re.S).group(1)
        for block in [toggles, readouts, presets]:
            keys = re.findall(r'^\s*(\w+):', block, re.M)
            assert len(set(keys)) == len(keys), 'Duplicate UI vector key'
            assert keys == ['position', 'velocity', 'acceleration', 'tangential', last_acceleration, 'jerk']
        assert 'data.' not in toggles
        assert "unitTeX: String.raw`\\mathrm{m\\,s^{-3}}`" in source
        # Reuse the real trajectory laws and numerical functions; omit the UI.
        pure = source[:source.index("  const viewport = document.getElementById('viewport');")]
        if dimensions == 2:
            pure += source[source.index('  function positionAt('):source.index('  function clipToPlot(')]
        test_file = Path(directory) / f'check-{dimensions}d.js'
        test_file.write_text(pure + f'\nconst dimensions = {dimensions};\n' + CHECKS)
        subprocess.run(command + [str(test_file)], check=True)
