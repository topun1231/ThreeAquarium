from pathlib import Path
from PIL import Image
import json,hashlib
p=Path(__file__).resolve().parents[1]/'public/assets'
catalog=json.loads((p/'catalog.json').read_text(encoding='utf-8-sig'))
seen={}
def pixels(f):
 with Image.open(f) as im:
  return hashlib.sha256(str(im.size).encode()+im.convert('RGBA').tobytes()).hexdigest()
for f in p.glob('texture-*.webp'):seen[pixels(f)]=f.name
names={}
for f in p.glob('catalog-texture-*'):
 if f.suffix=='.webp':continue
 key=pixels(f)
 if key in seen:names[f.name]=seen[key]
 else:
  target=f.with_suffix('.webp')
  with Image.open(f) as im:im.save(target,'WEBP',lossless=True,exact=True,method=4)
  assert pixels(target)==key
  names[f.name]=target.name;seen[key]=target.name
for m in catalog['assets']['materials']:
 for k in ['map','normal','roughnessMap','metalMap','aoMap']:
  if m.get(k) in names:m[k]=names[m[k]]
(p/'catalog.json').write_text(json.dumps(catalog,separators=(',',':')),encoding='utf8')
for name in names:
 f=(p/name).resolve();assert f.parent==p.resolve() and f.name.startswith('catalog-texture-');f.unlink()
s=json.loads((p.parents[1]/'tools/seed.json').read_text(encoding='utf-8-sig'))
# Source snapshot is read-only; import credits offline time only after the browser's first save.
(p/'setup.json').write_text(json.dumps(s,separators=(',',':')),encoding='utf8')
print('catalog entries',len(catalog['entries']),'unique new textures',len(set(names.values())-{f.name for f in p.glob('texture-*.webp')}))
