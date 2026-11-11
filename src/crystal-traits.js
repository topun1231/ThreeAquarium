// Deliberately game-like appearance branches, not a claim about biological alleles.
const COLOURS = ['red', 'black'];
const PATTERNS = ['band', 'hinomaru', 'mosura'];
export function validateShrimpName(name) {
  if (typeof name !== 'string' || name !== name.trim() || [...name].length < 1 || [...name].length > 16 || /[\u0000-\u001f\u007f]/u.test(name)) throw new Error('名字需为1至16字，不能包含控制字符或首尾空格');
  return name;
}
export function validateAppearance(record) {
  if (record.name !== undefined) validateShrimpName(record.name);
  const present = record.colour !== undefined || record.pattern !== undefined || record.traitGroup !== undefined;
  if (!present) return false; // Old pure-domain records remain valid, without inventing traits.
  if (!COLOURS.includes(record.colour) || !PATTERNS.includes(record.pattern) || record.traitGroup !== undefined && record.traitGroup !== 'crystal-game-v1') throw new Error('游戏化颜色、纹样或配对组无效');
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
