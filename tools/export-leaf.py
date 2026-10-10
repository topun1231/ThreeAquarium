from pathlib import Path
import json,hashlib
from PIL import Image
out=Path('public/assets');metadata=json.loads(Path('tools/leaf-metadata.json').read_text())['materials']
for m in metadata:
 if m['texture']:
  source=out/m['texture'];im=Image.open(source).convert('RGBA');target=out/('leaf-thickness-'+hashlib.sha256(im.tobytes()).hexdigest()[:12]+'.webp');im.save(target,lossless=True);assert Image.open(target).convert('RGBA').tobytes()==im.tobytes();m['thicknessMap']=target.name
for filename in ['scene.json','catalog.json']:
 path=out/filename;data=json.loads(path.read_text());pack=data if filename=='scene.json' else data['assets']
 for m in pack['materials']:
  if m['leaf']<0:continue
  extra=next(x for x in metadata if x['name']==m['name'])
  for key in ['softNormal','transmission','thicknessMap']:
   if key in extra:m[key]=extra[key]
 path.write_text(json.dumps(data,separators=(',',':')),encoding='utf8')
print('Applied source leaf maps and settings')
