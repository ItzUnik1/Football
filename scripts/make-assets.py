"""Generates Touchline launcher icons and landscape splash screens (original artwork, no external assets).
Run: python3 scripts/make-assets.py   (requires Pillow)"""
import os
from PIL import Image, ImageDraw, ImageFont

RES = 'android/app/src/main/res'
BG = (11, 15, 23, 255)
GREEN = (34, 197, 94, 255)
LINE = (232, 240, 236, 255)

def icon_art(size, adaptive):
    """Pitch-line 'T' mark. adaptive=True keeps content inside the 66% safe zone on a transparent canvas."""
    S = 1024
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0) if adaptive else BG)
    d = ImageDraw.Draw(img)
    scale = 0.62 if adaptive else 0.8
    c = S / 2
    r = S * scale / 2
    # pitch outline rounded rect
    d.rounded_rectangle([c - r, c - r * 0.78, c + r, c + r * 0.78], radius=int(r * 0.12), outline=GREEN, width=int(S * 0.028))
    # halfway line + centre circle
    d.line([c, c - r * 0.78, c, c + r * 0.78], fill=(34, 197, 94, 150), width=int(S * 0.014))
    d.ellipse([c - r * 0.3, c - r * 0.3, c + r * 0.3, c + r * 0.3], outline=(34, 197, 94, 150), width=int(S * 0.014))
    # bold T
    tw = r * 0.95
    th = S * 0.075
    d.rounded_rectangle([c - tw / 2, c - r * 0.42, c + tw / 2, c - r * 0.42 + th], radius=int(th * 0.3), fill=LINE)
    d.rounded_rectangle([c - th / 2, c - r * 0.42, c + th / 2, c + r * 0.5], radius=int(th * 0.3), fill=LINE)
    return img.resize((size, size), Image.LANCZOS)

def round_mask(img):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).ellipse([0, 0, img.size[0] - 1, img.size[1] - 1], fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), m)
    return out

legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
adaptive = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
for k, s in legacy.items():
    base = icon_art(s, False)
    base.save(f'{RES}/mipmap-{k}/ic_launcher.png')
    round_mask(base).save(f'{RES}/mipmap-{k}/ic_launcher_round.png')
for k, s in adaptive.items():
    icon_art(s, True).save(f'{RES}/mipmap-{k}/ic_launcher_foreground.png')

def font(px, bold=True):
    p = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    return ImageFont.truetype(p, px)

def splash(w, h):
    img = Image.new('RGB', (w, h), BG[:3])
    d = ImageDraw.Draw(img)
    unit = min(w, h)
    f = font(int(unit * 0.16))
    a, b = 'Touch', 'line'
    wa = d.textlength(a, font=f); wb = d.textlength(b, font=f)
    x = (w - wa - wb) / 2
    y = h / 2 - unit * 0.12
    d.text((x, y), a, font=f, fill=(255, 255, 255))
    d.text((x + wa, y), b, font=f, fill=GREEN[:3])
    f2 = font(int(unit * 0.045), bold=False)
    t = 'Football management simulation'
    d.text(((w - d.textlength(t, font=f2)) / 2, y + unit * 0.22), t, font=f2, fill=(148, 163, 184))
    d.line([w * 0.3, y - unit * 0.05, w * 0.7, y - unit * 0.05], fill=GREEN[:3], width=max(2, int(unit * 0.006)))
    return img

land = {'mdpi': (480, 320), 'hdpi': (800, 480), 'xhdpi': (1280, 720), 'xxhdpi': (1600, 960), 'xxxhdpi': (1920, 1280)}
for k, (w, h) in land.items():
    splash(w, h).save(f'{RES}/drawable-land-{k}/splash.png')
    splash(h, w).save(f'{RES}/drawable-port-{k}/splash.png')
splash(480, 320).save(f'{RES}/drawable/splash.png')
open(f'{RES}/drawable/ic_launcher_background.xml', 'w').write('''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
  <path android:fillColor="#0B0F17" android:pathData="M0,0h108v108h-108z"/>
</vector>
''')
print('assets generated')
