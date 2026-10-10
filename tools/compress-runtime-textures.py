#!/usr/bin/env python3
"""Cap and recompress runtime textures. Keeps HIGH-quality tank viewing distance."""
from __future__ import annotations
import json, os, shutil
from collections import defaultdict
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')

def slots(materials):
    out = defaultdict(set)
    for m in materials:
        for k in ('map', 'normal', 'roughnessMap', 'aoMap', 'metalMap', 'thicknessMap'):
            if m.get(k):
                out[m[k]].add(k)
    return out

def classify(names):
    if 'normal' in names:
        return 'normal'
    if names & {'roughnessMap', 'aoMap', 'metalMap'}:
        return 'data'
    if 'thicknessMap' in names:
        return 'thin'
    return 'color'

LIMITS = {
    'color': (2048, dict(quality=86, method=6)),
    'normal': (2048, dict(lossless=True, method=6)),
    'data': (1024, dict(quality=82, method=6)),
    'thin': (1024, dict(quality=80, method=6)),
}

def fit(im, max_edge):
    w, h = im.size
    edge = max(w, h)
    if edge <= max_edge:
        return im
    scale = max_edge / edge
    return im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)

def convert(path, kind, dest=None):
    dest = dest or path
    im = Image.open(path)
    max_edge, opts = LIMITS[kind]
    out = fit(im, max_edge)
    if dest.endswith('.jpg'):
        dest = dest.rsplit('.', 1)[0] + '.webp'
    os.makedirs(os.path.dirname(dest) or '.', exist_ok=True)
    save_opts = dict(format='WEBP', **opts)
    if out.mode not in ('RGB', 'RGBA'):
        out = out.convert('RGBA' if 'A' in out.mode else 'RGB')
    tmp = dest + '.tmp.webp'
    out.save(tmp, **save_opts)
    os.replace(tmp, dest)
    if dest != path and os.path.exists(path):
        os.remove(path)
    return dest, im.size, out.size

def main():
    scene = json.load(open(os.path.join(ROOT, 'scene.json')))
    catalog = json.load(open(os.path.join(ROOT, 'catalog.json')))
    mapping = {}
    mapping.update(slots(scene['materials']))
    mapping.update(slots(catalog['assets']['materials']))
    report = []
    for name, kinds in sorted(mapping.items()):
        src = os.path.join(ROOT, name)
        if not os.path.exists(src):
            continue
        kind = classify(kinds)
        before = os.path.getsize(src)
        dest, old, new = convert(src, kind)
        after = os.path.getsize(dest)
        rel = os.path.relpath(dest, ROOT)
        report.append((name, kind, old, new, before, after, rel))
        print(f'{name:42} {kind:6} {old[0]}x{old[1]} -> {new[0]}x{new[1]}  {before/1e6:.2f} -> {after/1e6:.2f} MB')

    anubias = os.path.join(ROOT, 'anubias')
    for name in os.listdir(anubias):
        if not name.endswith(('.webp', '.png', '.jpg')):
            continue
        src = os.path.join(anubias, name)
        before = os.path.getsize(src)
        dest, old, new = convert(src, 'color')
        after = os.path.getsize(dest)
        report.append((name, 'color', old, new, before, after, 'anubias/' + os.path.basename(dest)))
        print(f'{name:42} color  {old[0]}x{old[1]} -> {new[0]}x{new[1]}  {before/1e6:.2f} -> {after/1e6:.2f} MB')

    changed = {a: b for a, *_, b in report if a != b}
    if any(k.endswith('.jpg') for k in changed):
        for m in scene['materials']:
            for k in ('map', 'normal', 'roughnessMap', 'aoMap', 'metalMap', 'thicknessMap'):
                if m.get(k) in changed:
                    m[k] = changed[m[k]]
        json.dump(scene, open(os.path.join(ROOT, 'scene.json'), 'w'), separators=(',', ':'))
        print('updated scene.json texture names')
    print('done', len(report), 'files')

if __name__ == '__main__':
    main()
