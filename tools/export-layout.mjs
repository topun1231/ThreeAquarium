import fs from 'node:fs';
const source=JSON.parse(fs.readFileSync('tools/seed.json','utf8'));
const pack=JSON.parse(fs.readFileSync('public/assets/scene.json','utf8'));
const plants=source.Tank.Plants.map(record=>{
 const node=pack.nodes.findIndex(n=>n.name.endsWith(' '+record.UniqueId)||(record===source.Tank.Plants[0]&&n.name==='One baked plant instance'));
 if(node<0||pack.nodes[node].parent!==-1)throw new Error('Missing plant '+record.UniqueId);
 return {node,record};
});
fs.writeFileSync('public/assets/layout.json',JSON.stringify({version:1,tankId:source.Tank.UniqueId,minimumSoilHeight:source.Tank.Substrate.Heightfield.MinHeight,plants,hardscape:source.Tank.Hardscape}));
console.log({plants:plants.length,bytes:fs.statSync('public/assets/layout.json').size});

