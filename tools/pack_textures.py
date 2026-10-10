from pathlib import Path
from PIL import Image
import json,concurrent.futures,time
p=Path(__file__).resolve().parents[1]/'public/assets'
def convert(file):
 target=file.with_suffix('.webp')
 with Image.open(file) as im:
  im.save(target,'WEBP',lossless=True,exact=True,method=4)
  with Image.open(target) as restored:
   assert im.convert('RGBA').tobytes()==restored.convert('RGBA').tobytes(),file.name
 return {'old':file.name,'new':target.name,'before':file.stat().st_size,'after':target.stat().st_size}
if __name__=='__main__':
 rows=list(concurrent.futures.ThreadPoolExecutor(max_workers=2).map(convert,p.glob('texture-*.png')))
 pack=json.loads((p/'scene.json').read_text(encoding='utf-8-sig')); names={r['old']:r['new'] for r in rows}
 for m in pack['materials']:
  for key in ['map','normal','roughnessMap','metalMap','aoMap']:
   if m.get(key) in names:m[key]=names[m[key]]
 # Remove duplicate alias animations, retain the six runtime actions.
 pack['clips']=[c for c in pack['clips'] if 'RIG001B_' not in c['name']]
 (p/'scene.json').write_text(json.dumps(pack,separators=(',',':')),encoding='utf8')
 for r in rows:
  file=(p/r['old']).resolve();assert file.parent==p.resolve() and file.suffix=='.png';file.unlink()
 report={'mode':'lossless WebP, identical decoded RGBA pixels, original dimensions','files':rows,'savedBytes':sum(r['before']-r['after'] for r in rows)}
 (p.parent.parent/'evidence/texture-check.json').write_text(json.dumps(report,indent=2),encoding='utf8');print('saved MiB',report['savedBytes']/1048576)
