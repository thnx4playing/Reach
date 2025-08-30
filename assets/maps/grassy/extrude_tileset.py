# extrude_tileset.py
# pip install pillow
from PIL import Image
import math, sys, os

# --- CONFIG ---
TILE_W = 16
TILE_H = 16
EXTRUDE = 1          # duplicate ring size
BORDER = 1           # outer border around whole sheet
SPACING = 0          # additional empty pixels between tiles (usually 0)

in_path = sys.argv[1] if len(sys.argv) > 1 else "tiles.png"
im = Image.open(in_path).convert("RGBA")
W, H = im.size

cols = W // TILE_W
rows = H // TILE_H
if cols * TILE_W != W or rows * TILE_H != H:
    raise SystemExit(f"Input is not a tight {TILE_W}x{TILE_H} grid: {W}x{H}")

step = TILE_W + 2*EXTRUDE + SPACING  # distance between tile origins in output
out_w = BORDER*2 + cols*step - SPACING  # last tile has no trailing spacing
out_h = BORDER*2 + rows*step - SPACING

out = Image.new("RGBA", (out_w, out_h), (0,0,0,0))

def copy_tile(cx, cy):
    sx = cx * TILE_W
    sy = cy * TILE_H
    tile = im.crop((sx, sy, sx+TILE_W, sy+TILE_H))

    dx = BORDER + cx*step + EXTRUDE
    dy = BORDER + cy*step + EXTRUDE
    out.paste(tile, (dx, dy))

    # Extrude edges
    L = tile.crop((0,0,1,TILE_H)).resize((EXTRUDE, TILE_H), Image.NEAREST)
    R = tile.crop((TILE_W-1,0,TILE_W,TILE_H)).resize((EXTRUDE, TILE_H), Image.NEAREST)
    T = tile.crop((0,0,TILE_W,1)).resize((TILE_W, EXTRUDE), Image.NEAREST)
    B = tile.crop((0,TILE_H-1,TILE_W,TILE_H)).resize((TILE_W, EXTRUDE), Image.NEAREST)

    out.paste(L, (dx-EXTRUDE, dy))
    out.paste(R, (dx+TILE_W, dy))
    out.paste(T, (dx, dy-EXTRUDE))
    out.paste(B, (dx, dy+TILE_H))

    # Corners
    TL = tile.getpixel((0,0))
    TR = tile.getpixel((TILE_W-1,0))
    BL = tile.getpixel((0,TILE_H-1))
    BR = tile.getpixel((TILE_W-1,TILE_H-1))
    for ox in range(EXTRUDE):
        for oy in range(EXTRUDE):
            out.putpixel((dx-1-ox, dy-1-oy), TL)
            out.putpixel((dx+TILE_W+ox, dy-1-oy), TR)
            out.putpixel((dx-1-ox, dy+TILE_H+oy), BL)
            out.putpixel((dx+TILE_W+ox, dy+TILE_H+oy), BR)

for cy in range(rows):
    for cx in range(cols):
        copy_tile(cx, cy)

base, ext = os.path.splitext(in_path)
out_path = f"{base}-extruded{ext}"
out.save(out_path)
print("Wrote", out_path)
print("Use in Tiled with: Tile=16x16, Margin =", BORDER+EXTRUDE, ", Spacing =", 2*EXTRUDE+SPACING)
