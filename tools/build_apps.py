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
}
THEME_LINK = '<link rel="stylesheet" href="./phys1985-theme.css" />'


def build(name, source, archive_root, app_kind):
    files = {str(path.relative_to(source)): path.read_bytes()
             for path in sorted(source.rglob("*")) if path.is_file()}
    html = files["index.html"].decode("utf-8")
    if THEME_LINK not in html:
        html = html.replace('<link rel="stylesheet" href="./style.css" />',
                            '<link rel="stylesheet" href="./style.css" />\n  ' + THEME_LINK)
    html = html.replace("<body>", f'<body class="phys-app" data-app="{app_kind}">')
    if f'data-app="{app_kind}"' not in html:
        raise ValueError(f"Unexpected body element in {name}")
    files["index.html"] = html.encode("utf-8")
    files["phys1985-theme.css"] = (PROJECT / "assets/phys1985-theme.css").read_bytes()
    bindings = {
        '<script src="./vendor/mathjax/tex-svg.js" defer></script>': ("script", "vendor/mathjax/tex-svg.js"),
        '<link rel="stylesheet" href="./style.css" />': ("style", "style.css"),
        THEME_LINK: ("style", "phys1985-theme.css"),
        '<script src="./app.js" defer></script>': ("script", "app.js"),
    }
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
    args = parser.parse_args()
    overrides = {}
    for item in args.source:
        name, path = item.split("=", 1)
        if name not in APPS:
            parser.error(f"Unknown application: {name}")
        overrides[name] = Path(path)
    for name, (app_kind, archive_root) in APPS.items():
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
