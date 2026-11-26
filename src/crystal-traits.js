// Deliberately game-like appearance branches, not a claim about biological alleles.
// Saved version-one competition seeds refer to positions in these palettes.
export const COLOURS_V1 = Object.freeze(['red', 'black']);
export const PATTERNS_V1 = Object.freeze(['band', 'hinomaru', 'mosura']);
export const qualityTraits = ['colour', 'coverage', 'edge'];
// A keeper can look for either width using the same visible coverage trait.
export const breedingDirections = [
  {value:'colour', index:0, label:'颜色'},
  {value:'coverage', index:1, label:'白色覆盖更多'},
  {value:'edge', index:2, label:'边缘'},
  {value:'fine-band', index:1, label:'白带更细', pattern:'band', lower:true},
  {value:'wide-band', index:1, label:'白带更宽', pattern:'band'},
];
export const breedingDirection = key => breedingDirections.find(direction => direction.value === key);

export function bandGoalProblem(key, appearanceGoal, mother, father) {
  if (!breedingDirection(key)?.pattern) return '';
  if (appearanceGoal && !appearanceGoal.endsWith(':band')) return '白带宽窄只比较条带纹。请改选条带花色，或换个观察方向。';
  if (!mother || !father) return '';
  if (!mother.pattern || !father.pattern) return '亲虾的纹样记录不全，无法比较白带宽窄。';
  return mother.pattern === 'band' || father.pattern === 'band' ? '' : '两只亲虾都没有条带纹。换一只条带亲虾，或换个观察方向。';
}

const visibleQuality = (record, index) => Number(record.P[index].toFixed(2));
export function directionRank(direction, record) {
  if (direction.pattern && record.pattern !== direction.pattern) return 0;
  const value = visibleQuality(record, direction.index);
  return direction.lower ? 10 - value : value;
}

export function appearance(record) {
  if (record.legacy) return record.species === 'red-cherry-shrimp' ? '原有樱花虾 · 观赏' : '原有虾 · 观赏';
  return [({red:'红晶', black:'黑晶'})[record.colour], ({band:'条带纹', hinomaru:'日之丸纹', mosura:'白头纹'})[record.pattern]].filter(Boolean).join(' · ');
}

export function matchesShrimpSearch(query,...fields) {
  const terms=query.toLowerCase().split(/[\s·]+/).filter(Boolean);
  if (!terms.length) return true;
  const text=fields.map(value=>value.toLowerCase().replace(/[\s·]+/g,'')).join(' ');
  return terms.every(term=>text.includes(term));
}

export function hasGoalColour(child,goal) {
  return goal===child.colour+':'+child.pattern;
}

export function meetsBroodGoal(child,appearanceGoal,qualityTarget) {
  return (!appearanceGoal || hasGoalColour(child,appearanceGoal)) &&
    (!qualityTarget || qualityTarget.matches(child));
}

export function pastGoalResults(batches, appearanceGoal, qualityTarget) {
  let evaluated=0, matched=0, unknown=0;
  for (const batch of batches) {
    if (batch.status !== 'complete') continue;
    for (const child of batch.children) {
      if ((appearanceGoal || qualityTarget?.pattern) && (!child.colour || !child.pattern)) { unknown++; continue; }
      evaluated++;
      if (meetsBroodGoal(child,appearanceGoal,qualityTarget)) matched++;
    }
  }
  return {evaluated,matched,unknown};
}

// Compare the scores players actually see in the journal, including at the cap.
export function broodQualityTarget(key, mother, father) {
  const direction = breedingDirection(key);
  if (!direction || !mother || !father || bandGoalProblem(key, '', mother, father)) return null;
  const accepts = record => !direction.pattern || record.pattern === direction.pattern;
  const references = [mother, father].filter(accepts);
  const values = references.map(record => visibleQuality(record, direction.index));
  const best = direction.lower ? Math.min(...values) : Math.max(...values);
  const atLimit = best === (direction.lower ? 1 : 9);
  const difference = child => {
    if (!accepts(child)) return null;
    const value = visibleQuality(child, direction.index);
    return Number((direction.lower ? best - value : value - best).toFixed(2));
  };
  const matches = child => atLimit ? difference(child) === 0 : difference(child) > 0;
  return {...direction, best, atLimit, accepts, difference, matches};
}

export function broodAlternatives(children,goal,target) {
  if(!goal || !target || !children.length)return [];
  const comparable=children.filter(target.accepts);
  const sameLook=comparable.filter(kid=>goal===kid.colour+':'+kid.pattern);
  if(sameLook.some(target.matches))return [];
  const bestOf=group=>Math.max(...group.map(target.difference));
  const bestLook=bestOf(sameLook), bestOverall=bestOf(comparable);
  const options=sameLook.filter(kid=>target.difference(kid)===bestLook).map(kid=>({kid,byLook:true}));
  if(bestOverall>bestLook){
    for(const kid of comparable)if(target.difference(kid)===bestOverall)options.push({kid,byLook:false});
  }
  return options;
}
export function validateShrimpName(name) {
  if (typeof name !== 'string' || name !== name.trim() || [...name].length < 1 || [...name].length > 16 || /[\u0000-\u001f\u007f]/u.test(name)) throw new Error('名字需为1至16字，不能包含控制字符或首尾空格');
  return name;
}
export const OBSERVATION_LIMIT = 60;
export function validateObservation(value) {
  if (typeof value !== 'string' || value !== value.trim() || [...value].length > OBSERVATION_LIMIT || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(value))
    throw new Error('观察可写一行，最多 '+OBSERVATION_LIMIT+' 个字。');
  return value;
}
export function validateAppearance(record) {
  if (record.name !== undefined) validateShrimpName(record.name);
  const present = record.colour !== undefined || record.pattern !== undefined || record.traitGroup !== undefined;
  if (!present) return false; // Old pure-domain records remain valid, without inventing traits.
  if (!COLOURS_V1.includes(record.colour) || !PATTERNS_V1.includes(record.pattern) || record.traitGroup !== undefined && record.traitGroup !== 'crystal-game-v1') throw new Error('游戏化颜色、纹样或配对组无效');
  return true;
}
export function predictAppearance(mother, father) {
  const a = validateAppearance(mother), b = validateAppearance(father);
  if (a !== b) throw new Error('亲虾外观资料不完整，不能推定配对分支');
  if (!a) return null;
  const branches = key => mother[key] === father[key] ? [{value:mother[key], probability:1}] : [{value:mother[key], probability:0.5}, {value:father[key], probability:0.5}];
  return {model:'game-like-parent-directions-v1', colour:branches('colour'), pattern:branches('pattern')};
}
export function offspringAppearance(mother, father, childId) {
  if (!predictAppearance(mother, father)) return {};
  if (typeof childId !== 'string' || !childId) throw new Error('后代身份无效');
  // Separate deterministic stream; it never consumes the seven quality/sex draws.
  let seed = 2166136261;
  for (const character of JSON.stringify([childId, mother.id, father.id])) seed = Math.imul(seed ^ character.codePointAt(0), 16777619) >>> 0;
  const draw = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return {name:`幼虾${childId.split('-').at(-1).slice(-12)}`, colour:(draw() < 0.5 ? mother : father).colour,
    pattern:(draw() < 0.5 ? mother : father).pattern, traitGroup:'crystal-game-v1'};
}

export function appearanceOutcomes(mother, father) {
  const branches = predictAppearance(mother, father);
  if (!branches) return [];
  return branches.colour.flatMap(colour => branches.pattern.map(pattern => ({
    colour:colour.value, pattern:pattern.value, key:colour.value + ':' + pattern.value,
    probability:colour.probability * pattern.probability,
  })));
}

// Only eligible adults are passed in. Missing appearance data cannot imply a match.
export function goalPartners(adults, goal) {
  const matches=new Map();
  if (!goal) return matches;
  const fathers=adults.filter(r=>r.sex==='male' && r.colour && r.pattern);
  for (const mother of adults) {
    if (mother.sex!=='female' || !mother.colour || !mother.pattern) continue;
    for (const father of fathers) {
      const hit=appearanceOutcomes(mother,father).find(outcome=>outcome.key===goal);
      if (!hit) continue;
      if (!matches.has(mother.id)) matches.set(mother.id,new Map());
      if (!matches.has(father.id)) matches.set(father.id,new Map());
      matches.get(mother.id).set(father.id,hit.probability);
      matches.get(father.id).set(mother.id,hit.probability);
    }
  }
  return matches;
}

export function orderParentCandidates(candidates, matches, partnerId, qualityGoal) {
  const direction=breedingDirection(qualityGoal);
  if(!matches && !direction)return candidates;
  const chance=r=>matches?.get(r.id)?.get(partnerId) ?? 0;
  const rankByAvailableMates=matches && !partnerId;
  const hasMate=r=>rankByAvailableMates && matches.has(r.id) ? 1 : 0;
  const visible=r=>direction ? directionRank(direction,r) : 0;
  return candidates.sort((a,b)=>chance(b)-chance(a) || hasMate(b)-hasMate(a) || visible(b)-visible(a));
}
