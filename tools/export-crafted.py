from pathlib import Path
import re,json
root=Path('D:/Aquarium_WorkEvidence/Current/AQ_TANKSTYLE001/PreviewProject/Assets')
p=Path(__file__).resolve().parents[1]/'public/assets/scene.json'
pack=json.loads(p.read_text(encoding='utf-8-sig'))
for m in pack['materials']:
 if m['shader']!='Aquarium/Rework Crafted Surface':continue
 name=m['name'].split(' / ')[-1]
 folder=root/('RealFrame001/Materials' if m['name'].startswith('RealFrame refinement /') else '_Aquarium/Rework/Materials')
 source=folder/(name+'.mat');text=source.read_text(encoding='utf-8-sig')
 def scalar(k):return float(re.search(r'- '+re.escape(k)+r': ([\d.eE+-]+)',text)[1])
 color=re.search(r'_DarkColor: \{r: ([\d.eE+-]+), g: ([\d.eE+-]+), b: ([\d.eE+-]+)',text)
 m['crafted']={'dark':[float(v) for v in color.groups()],'kind':scalar('_Kind'),'scale':scalar('_Scale'),'bump':scalar('_Bump')}
p.write_text(json.dumps(pack,separators=(',',':')),encoding='utf8')
print('Original crafted surface parameters exported')
