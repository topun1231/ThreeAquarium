export const NAVIGATION_LIMIT=12000;
// Older planted tanks could save more points than their reader accepted.
export const LEGACY_NAVIGATION_LIMIT=2*NAVIGATION_LIMIT;

export function limitNavigationSamples(anchors,rootCount,limit=NAVIGATION_LIMIT){
  if(anchors.length<=limit)return anchors;
  const required=new Set(anchors.slice(0,rootCount));
  const owners=new Set([...required].map(a=>a.owner));
  for(const anchor of anchors){
    if(owners.has(anchor.owner))continue;
    owners.add(anchor.owner);
    required.add(anchor);
  }
  const optional=anchors.length-required.size,slots=limit-required.size;
  let balance=0;
  return anchors.filter(anchor=>{
    if(required.has(anchor))return true;
    balance+=slots;
    if(balance<optional)return false;
    balance-=optional;
    return true;
  });
}
