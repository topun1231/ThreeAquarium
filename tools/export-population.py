from pathlib import Path
import json,re
root=Path('D:/Aquarium_WorkEvidence/Current/AQ_TANKSTYLE001/PreviewProject/Assets')
s=(root/'ShrimpReal002/Generated/AQ_REAL002.unity').read_text(encoding='utf-8-sig')
s=s.split('  Population:\n',1)[1].split('  PelletPrefab:',1)[0]
records=[]
for block in s.split('    InitialState:\n')[1:]:
 record={};section=record
 for line in block.splitlines():
  m=re.match(r'^(      |        )(\w+):\s*(.*)$',line)
  if not m:continue
  indent,key,value=m.groups()
  if len(indent)==6:section=record
  if key in ['Needs','Personality','Memory']:
   record[key]={};section=record[key];continue
  if value.startswith('{'):value={k:float(v) for k,v in re.findall(r'(\w+): ([\d.eE+-]+)',value)}
  elif re.fullmatch(r'-?\d+(\.\d+)?',value):value=float(value)
  section[key]=value
 records.append(record)
assert len(records)==5 and records[0]['Needs']['Fatigue']==.23
Path('public/assets/initial-population.json').write_text(json.dumps(records,separators=(',',':')),encoding='utf8')
print('5 original initial population slots exported')
