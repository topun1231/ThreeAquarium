// Exported prefab catalog contains every Unity LOD; render only the best available sibling.
export function highestDetailDraws(pack) {
  const groups=new Map(),keys=new Map();
  for(const draw of pack.draws){
    const node=pack.nodes[draw.node],match=/^(.*)_LOD(\d+)$/.exec(node.name);
    if(!match)continue;
    const key=node.parent+':'+match[1],level=Number(match[2]);
    keys.set(draw,{key,level});groups.set(key,Math.min(groups.get(key)??Infinity,level));
  }
  return pack.draws.filter(draw=>!keys.has(draw)||keys.get(draw).level===groups.get(keys.get(draw).key));
}
