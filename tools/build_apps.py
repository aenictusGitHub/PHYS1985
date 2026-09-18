"""Embed the common PHYS1985 theme while preserving self-contained applications.

By default the source archives are authoritative. An explicit --source name=path
can instead package a working source folder. No external dependencies are needed.
"""

import argparse
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile


PROJECT = Path(__file__).resolve().parent.parent
APPS = {
    "cinematique_2d_webapp_fr": ("kinematics-2d", "cinematique_2d_webapp_fr_formules_vecteurs_latex_svg_v2_source"),
    "cinematique_3d_webapp_fr": ("kinematics-3d", "cinematique_3d_webapp_fr_position_origine_latex_svg_corrigee_v2"),
    "puissance_travail_webapp_fr": ("energy", "puissance_travail_webapp_fr_source"),
    "energie_mecanique_webapp_fr": ("conservation", "energie_mecanique_webapp_fr_source"),
    "potentiel_force_webapp_fr": ("potential", "potentiel_force_webapp_fr_source"),
    "moment_cinetique_webapp_fr": ("angular", "moment_cinetique_webapp_fr_source"),
    "collisions_webapp_fr": ("collisions", "collisions_webapp_fr_source"),
    "poulies_webapp_fr": ("pulleys", "poulies_webapp_fr_source"),
    "frottements_solides_webapp_fr": ("friction", "frottements_solides_webapp_fr_source"),
    "equilibres_statiques_webapp_fr": ("statics", "equilibres_statiques_webapp_fr_source"),
}
THEME_LINK = '<link rel="stylesheet" href="./phys1985-theme.css" />'
SHARE_LINK = '<link rel="stylesheet" href="./phys1985-share.css" />'
SHARE_SCRIPT = '<script src="./phys1985-share.js" defer></script>'
TOUCH_LINK = '<link rel="stylesheet" href="./phys1985-touch.css" />'
TOUCH_SCRIPT = '<script src="./phys1985-touch.js" defer></script>'
MOBILE_SCRIPT = '<script src="./phys1985-mobile.js" defer></script>'
MOBILE_3D_SCRIPT = '<script src="./phys1985-mobile-3d.js" defer></script>'


def build(name, source, archive_root, app_kind):
    files = {str(path.relative_to(source)): path.read_bytes()
             for path in sorted(source.rglob("*")) if path.is_file()}
    # A local source folder can also contain its generated standalone output.
    # Do not recursively bundle the generated artifacts inside the source ZIP.
    files.pop(f"{name}.html", None)
    files.pop(f"{name}.zip", None)
    html = files["index.html"].decode("utf-8")
    if THEME_LINK not in html:
        html = html.replace('<link rel="stylesheet" href="./style.css" />',
                            '<link rel="stylesheet" href="./style.css" />\n  ' + THEME_LINK)
    html = html.replace("<body>", f'<body class="phys-app" data-app="{app_kind}">')
    if f'data-app="{app_kind}"' not in html:
        raise ValueError(f"Unexpected body element in {name}")
    if 'PhysShare?.register' in files['app.js'].decode('utf-8'):
        if SHARE_LINK not in html:
            html = html.replace(THEME_LINK, THEME_LINK + '\n  ' + SHARE_LINK)
        if SHARE_SCRIPT not in html:
            html = html.replace('<script src="./app.js" defer></script>', SHARE_SCRIPT + '\n  <script src="./app.js" defer></script>')
        for filename in ('phys1985-share.js', 'phys1985-share.css'):
            files[filename] = (PROJECT / 'assets' / filename).read_bytes()
    files["phys1985-theme.css"] = (PROJECT / "assets/phys1985-theme.css").read_bytes()
    if TOUCH_LINK not in html:
        html = html.replace('</head>', '  ' + TOUCH_LINK + '\n</head>')
    if TOUCH_SCRIPT not in html:
        html = html.replace('<script src="./app.js" defer></script>', TOUCH_SCRIPT + '\n  <script src="./app.js" defer></script>')
    for filename in ('phys1985-touch.js', 'phys1985-touch.css'):
        files[filename] = (PROJECT / 'assets' / filename).read_bytes()
    if app_kind in ('kinematics-2d', 'kinematics-3d'):
        if MOBILE_SCRIPT not in html:
            html = html.replace('<script src="./app.js" defer></script>', MOBILE_SCRIPT + '\n  <script src="./app.js" defer></script>')
        files['phys1985-mobile.js'] = (PROJECT / 'assets/phys1985-mobile.js').read_bytes()
    if app_kind == 'kinematics-3d':
        if MOBILE_3D_SCRIPT not in html:
            html = html.replace('<script src="./app.js" defer></script>', MOBILE_3D_SCRIPT + '\n  <script src="./app.js" defer></script>')
        files['phys1985-mobile-3d.js'] = (PROJECT / 'assets/phys1985-mobile-3d.js').read_bytes()
    files["index.html"] = html.encode("utf-8")
    bindings = {
        '<script src="./vendor/mathjax/tex-svg.js" defer></script>': ("script", "vendor/mathjax/tex-svg.js"),
        '<link rel="stylesheet" href="./style.css" />': ("style", "style.css"),
        THEME_LINK: ("style", "phys1985-theme.css"),
        '<script src="./app.js" defer></script>': ("script", "app.js"),
        TOUCH_LINK: ("style", "phys1985-touch.css"),
        TOUCH_SCRIPT: ("script", "phys1985-touch.js"),
    }
    if "physics.js" in files:
        bindings['<script src="./physics.js" defer></script>'] = ("script", "physics.js")
    if MOBILE_SCRIPT in html:
        bindings[MOBILE_SCRIPT] = ("script", "phys1985-mobile.js")
    if MOBILE_3D_SCRIPT in html:
        bindings[MOBILE_3D_SCRIPT] = ("script", "phys1985-mobile-3d.js")
    if SHARE_SCRIPT in html:
        bindings[SHARE_SCRIPT] = ("script", "phys1985-share.js")
        bindings[SHARE_LINK] = ("style", "phys1985-share.css")
    for reference, (tag, filename) in bindings.items():
        if html.count(reference) != 1:
            raise ValueError(f"Missing or duplicate {reference} in {name}")
        content = files[filename].decode("utf-8")
        html = html.replace(reference, f"<{tag}>\n{content}\n</{tag}>")

    (PROJECT / f"{name}.html").write_text(html, encoding="utf-8")
    with ZipFile(PROJECT / f"{name}.zip", "w", ZIP_DEFLATED, compresslevel=9) as archive:
        for filename, content in sorted(files.items()):
            archive.writestr(f"{archive_root}/{filename}", content)
    print(f"Built {name}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="append", default=[], metavar="NAME=PATH")
    parser.add_argument("--app", action="append", choices=APPS, help="Only rebuild the selected application(s)")
    args = parser.parse_args()
    overrides = {}
    for item in args.source:
        name, path = item.split("=", 1)
        if name not in APPS:
            parser.error(f"Unknown application: {name}")
        overrides[name] = Path(path)
    for name, (app_kind, archive_root) in APPS.items():
        if args.app and name not in args.app:
            continue
        if name in overrides:
            build(name, overrides[name], archive_root, app_kind)
            continue
        with TemporaryDirectory(prefix="phys1985-build-") as directory:
            target = Path(directory).resolve()
            with ZipFile(PROJECT / f"{name}.zip") as archive:
                for member in archive.infolist():
                    if not (target / member.filename).resolve().is_relative_to(target):
                        raise ValueError("Unsafe archive path")
                archive.extractall(target)
            build(name, target / archive_root, archive_root, app_kind)


if __name__ == "__main__":
    main()
