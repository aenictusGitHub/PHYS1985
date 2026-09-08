"""Decode all exported QR codes and check uniform geometry (requires OpenCV)."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import cv2

directory = Path(__file__).resolve().parent.parent / "qr-codes"
for name in ["cinematique_2d", "cinematique_3d", "puissance_travail", "energie_mecanique",
             "potentiel_force", "moment_cinetique", "collisions", "poulies"]:
    image = cv2.imread(str(directory / f"{name}.png"))
    assert image is not None and image.shape == (564, 564, 3), name
    result, corners, _ = cv2.QRCodeDetector().detectAndDecode(image)
    expected = f"https://aenictusgithub.github.io/PHYS1985/{name}_webapp_fr.html"
    assert result == expected, f"{name}: wrong QR destination: {result!r}"
    root = ET.parse(directory / f"{name}.svg").getroot()
    assert root.attrib["viewBox"] == "0 0 47 47", name
    assert root.attrib["shape-rendering"] == "crispEdges", name
    assert "width" not in root.attrib and "height" not in root.attrib, name
    modules = [[False] * 47 for _ in range(47)]
    for path in root.findall("{http://www.w3.org/2000/svg}path"):
        assert path.attrib["fill"] == "#000", name
        runs = re.findall(r"M(\d+) (\d+)h(\d+)v1h-(\d+)z", path.attrib["d"])
        assert runs, name
        for x, y, length, back in runs:
            x, y, length, back = map(int, (x, y, length, back))
            assert length == back and 5 <= y < 42 and 5 <= x < x + length <= 42, name
            modules[y][x:x + length] = [True] * length
    for y, row in enumerate(modules):
        for x, dark in enumerate(row):
            # Check every exported pixel, not only module centers: no blur/gray seams.
            assert (image[y*12:(y+1)*12, x*12:(x+1)*12] == (0 if dark else 255)).all(), name
    print(f"{name}: SVG/PNG agree, uniform format, correct decoded destination.")
