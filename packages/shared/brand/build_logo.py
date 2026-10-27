"""
Builds the PropShop logo from one source of geometry, so every copy is identical:

  packages/shared/brand/propshop-logo.svg   mark + PROP/SHOP wordmark
  packages/shared/brand/propshop-mark.svg   the tag mark alone (icons, small sizes)
  propshop-app/lib/widgets/brand_logo.dart  Flutter painter (no flutter_svg dependency)
  propshop-web/src/components/logoPaths.ts  path data for the site's <Logo>

The mark is a house-shaped price tag with a punched hole, measured off the brand art
(1600px canvas). The wordmark is Arial Bold outlined to paths and fitted to the art's
letter box, so no font has to be installed anywhere it renders.

Run:  python packages/shared/brand/build_logo.py
"""
import re
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parents[3]  # E:\propshop
BRAND = Path(__file__).resolve().parent

# --- Mark (1600px art coordinates) -------------------------------------------------
TAG = "M120 1136L700 1136L700 762Q700 750 692 740L446 460Q410 420 374 460L128 740Q120 750 120 762Z"
HOLE = "M410 554A47 47 0 1 1 410 648A47 47 0 1 1 410 554Z"
MARK = TAG + HOLE  # even-odd: the hole is punched out

# --- Wordmark ------------------------------------------------------------------------
LINES = [("PROP", 921), ("SHOP", 1137)]  # text, baseline y in art coordinates
CAP = 176                                 # cap height in the art
X0, X1 = 744, 1457                        # the letters' ink box in the art

font = TTFont(r"C:\Windows\Fonts\arialbd.ttf")
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
scale = CAP / font["OS/2"].sCapHeight


def line_path(text: str, baseline: float) -> str:
    # First pass at natural width to find the ink box, then fit it to X0..X1.
    adv = [glyphs[cmap[ord(c)]].width for c in text]
    lsb0 = font["hmtx"][cmap[ord(text[0])]][1]
    last = cmap[ord(text[-1])]
    rsb_last = font["hmtx"][last][0] - (font["glyf"][last].xMax)
    ink_units = sum(adv) - lsb0 - rsb_last
    sx = (X1 - X0) / (ink_units * scale)
    out, x = [], -lsb0
    for c, a in zip(text, adv):
        pen = SVGPathPen(glyphs)
        # font units (y up) -> art coordinates (y down)
        t = TransformPen(pen, (scale * sx, 0, 0, -scale, X0 + x * scale * sx, baseline))
        glyphs[cmap[ord(c)]].draw(t)
        out.append(pen.getCommands())
        x += a
    return "".join(out)


WORD = "".join(line_path(t, b) for t, b in LINES)


def r1(path: str) -> str:
    return re.sub(r"-?\d+\.\d+", lambda m: f"{float(m.group()):.1f}".rstrip("0").rstrip("."), path)


MARK, WORD = r1(MARK), r1(WORD)

# Crop boxes (art coordinates), with a little breathing room.
FULL_BOX = (100, 418, 1378, 740)  # x, y, w, h
MARK_BOX = (100, 418, 620, 740)


def svg(box, paths):
    x, y, w, h = box
    body = "".join(f'<path fill-rule="evenodd" d="{p}"/>' for p in paths)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" fill="#000">{body}</svg>\n'


(BRAND / "propshop-logo.svg").write_text(svg(FULL_BOX, [MARK, WORD]), encoding="utf-8")
(BRAND / "propshop-mark.svg").write_text(svg(MARK_BOX, [MARK]), encoding="utf-8")

# --- SVG path -> Dart Path ------------------------------------------------------------
TOK = re.compile(r"[MLHVQCAZ]|-?\d*\.?\d+(?:e-?\d+)?", re.I)


def to_dart(path: str, ox: float, oy: float) -> str:
    toks, i, cmd, out = TOK.findall(path), 0, None, []
    cx = cy = sx = sy = 0.0

    def n():
        nonlocal i
        i += 1
        return float(toks[i - 1])

    f = lambda v: f"{v:.1f}"
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]
            i += 1
        if cmd == "M":
            cx, cy = n(), n(); sx, sy = cx, cy
            out.append(f"..moveTo({f(cx-ox)}, {f(cy-oy)})"); cmd = "L"
        elif cmd == "L":
            cx, cy = n(), n(); out.append(f"..lineTo({f(cx-ox)}, {f(cy-oy)})")
        elif cmd == "H":
            cx = n(); out.append(f"..lineTo({f(cx-ox)}, {f(cy-oy)})")
        elif cmd == "V":
            cy = n(); out.append(f"..lineTo({f(cx-ox)}, {f(cy-oy)})")
        elif cmd == "Q":
            x1, y1, cx, cy = n(), n(), n(), n()
            out.append(f"..quadraticBezierTo({f(x1-ox)}, {f(y1-oy)}, {f(cx-ox)}, {f(cy-oy)})")
        elif cmd == "C":
            x1, y1, x2, y2, cx, cy = n(), n(), n(), n(), n(), n()
            out.append(f"..cubicTo({f(x1-ox)}, {f(y1-oy)}, {f(x2-ox)}, {f(y2-oy)}, {f(cx-ox)}, {f(cy-oy)})")
        elif cmd == "A":
            rx, ry, _rot, large, sweep, cx, cy = n(), n(), n(), n(), n(), n(), n()
            out.append(f"..arcToPoint(const Offset({f(cx-ox)}, {f(cy-oy)}), radius: const Radius.elliptical({f(rx)}, {f(ry)}), largeArc: {'true' if large else 'false'}, clockwise: {'true' if sweep else 'false'})")
        elif cmd in "Zz":
            out.append("..close()"); cx, cy = sx, sy; cmd = None
        else:
            raise ValueError(cmd)
    return "\n      ".join(out)


fx, fy, fw, fh = FULL_BOX
mx, my, mw, mh = MARK_BOX
dart = f"""// GENERATED by packages/shared/brand/build_logo.py — do not edit by hand.
import 'package:flutter/material.dart';

/// The PropShop logo: a house-shaped price tag, optionally with the stacked
/// PROP / SHOP wordmark. Drawn as vector paths, so it is sharp at any size and needs
/// no font or image asset. Defaults to black; pass white on dark backgrounds.
class BrandLogo extends StatelessWidget {{
  const BrandLogo({{super.key, this.height = 32, this.color = Colors.black, this.markOnly = false}});

  final double height;
  final Color color;

  /// Just the tag — for tight spaces where the wordmark would be too small to read.
  final bool markOnly;

  @override
  Widget build(BuildContext context) {{
    final w = markOnly ? {mw}.0 : {fw}.0;
    return Semantics(
      label: 'PropShop',
      child: CustomPaint(
        size: Size(height * w / {fh}.0, height),
        painter: _LogoPainter(color, markOnly),
      ),
    );
  }}
}}

class _LogoPainter extends CustomPainter {{
  _LogoPainter(this.color, this.markOnly);

  final Color color;
  final bool markOnly;

  static final Path _mark = Path()
      ..fillType = PathFillType.evenOdd
      {to_dart(MARK, fx, fy)};

  static final Path _word = Path()
      ..fillType = PathFillType.evenOdd
      {to_dart(WORD, fx, fy)};

  @override
  void paint(Canvas canvas, Size size) {{
    final s = size.height / {fh}.0;
    canvas.scale(s, s);
    final paint = Paint()..color = color;
    canvas.drawPath(_mark, paint);
    if (!markOnly) canvas.drawPath(_word, paint);
  }}

  @override
  bool shouldRepaint(_LogoPainter old) => old.color != color || old.markOnly != markOnly;
}}
"""
(ROOT / "propshop-app/lib/widgets/brand_logo.dart").write_text(dart, encoding="utf-8")

ts = f"""// GENERATED by packages/shared/brand/build_logo.py — do not edit by hand.
/** The PropShop tag mark and PROP/SHOP wordmark, in the brand art's coordinates. */
export const LOGO_MARK = "{MARK}";
export const LOGO_WORD = "{WORD}";
export const LOGO_FULL_VIEWBOX = "{fx} {fy} {fw} {fh}";
export const LOGO_MARK_VIEWBOX = "{mx} {my} {mw} {mh}";
"""
(ROOT / "propshop-web/src/components/logoPaths.ts").write_text(ts, encoding="utf-8")
print("built:", len(MARK), "mark chars,", len(WORD), "wordmark chars")
