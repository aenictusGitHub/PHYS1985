"""Generate the Poulies QR in the common PHYS1985 SVG/PNG format.

Requires ReportLab and Pillow. Does not change any other QR code.
"""
from pathlib import Path
from xml.etree import ElementTree as ET

from PIL import Image, ImageDraw
from reportlab.graphics.barcode import qrencoder

name = "poulies"
url = f"https://aenictusgithub.github.io/PHYS1985/{name}_webapp_fr.html"
target = Path(__file__).resolve().parent.parent / "qr-codes"
code = qrencoder.QRCode(5, qrencoder.QRErrorCorrectLevel.M)
code.addData(url)
code.make()
assert code.getModuleCount() == 37
border, scale, side = 5, 12, 47
image = Image.new("RGB", (side * scale, side * scale), "white")
draw = ImageDraw.Draw(image)
runs = []
for y in range(37):
    x = 0
    while x < 37:
        if not code.isDark(y, x):
            x += 1
            continue
        start = x
        while x < 37 and code.isDark(y, x):
            x += 1
        left, top, length = start + border, y + border, x - start
        runs.append(f"M{left} {top}h{length}v1h-{length}z")
        draw.rectangle((left * scale, top * scale,
                        (left + length) * scale - 1, (top + 1) * scale - 1),
                       fill="black")
svg = ET.Element("svg", xmlns="http://www.w3.org/2000/svg",
                 viewBox=f"0 0 {side} {side}", **{
                     "shape-rendering": "crispEdges", "role": "img",
                     "aria-label": "QR code vers l’animation Poulies"})
ET.SubElement(svg, "rect", width=str(side), height=str(side), fill="#fff")
ET.SubElement(svg, "path", d="".join(runs), fill="#000")
ET.ElementTree(svg).write(target / f"{name}.svg", encoding="utf-8",
                          xml_declaration=True)
image.save(target / f"{name}.png")
print(f"{name}: SVG 47 modules, PNG 564 × 564, destination {url}")
