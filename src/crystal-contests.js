import {generateOffspring, scoreShrimp, rateScore, contestWeights, judgedTrait, FINE_BAND} from './crystal-genetics.js';
import {COLOURS_V1, PATTERNS_V1} from './crystal-traits.js';
import {stableSeed} from './state.js';

// Candidate difficulty, independent of the entrant. Persist the returned card.
const BASELINES = {entry:[5.5, 6, 6.5], advanced:[7, 7.5, 8]};
const THEMES = ['colour', 'pattern'];

// A brood's invitation stays identical as the clock, breeding RNG and candidate change.
export function rookieCard(state,batch) {
  const base=state.contests.cards.find(card=>card.id==='colour-entry');
  const seed=stableSeed(`rookie-v1:${base.seed}:${batch.id}`);
  return createContest({id:batch.id,theme:THEMES[seed%2],tier:'entry',seed});
}

// Version 1 exhibitions open relative to the last entry. Unplayed invitations never expire.
const EXHIBITION_INTERVAL = 2 * 60 * 60 * 1000;
export function exhibitionRound(id) {
  const match = /^exhibition:([1-9]\d*)(?::fine-band)?$/.exec(id);
  return match && match[0] === id && Number.isSafeInteger(Number(match[1])) ? Number(match[1]) : 0;
}

export function acceptsContestPattern(card, individual) {
  return card.theme !== FINE_BAND || individual.pattern === 'band';
}

export function exhibitionCard(state,round,id=state.contests.exhibitions?.[round-1]?.contestId ?? `exhibition:${round}`) {
  const publicId = `exhibition:${round}`, fineBand = id === publicId + ':' + FINE_BAND;
  if (!Number.isSafeInteger(round) || round < 1 || (!fineBand && id !== publicId)) throw new Error('专题赛组别与届次不一致');
  const base=state.contests.cards.find(card=>card.id==='colour-entry');
  const seed=stableSeed(`exhibition-v1:${base.seed}:${round}` + (fineBand ? ':' + FINE_BAND : ''));
  return createContest({id,theme:fineBand ? FINE_BAND : THEMES[(round-1)%2],tier:(round-1)%4<2?'entry':'advanced',seed});
}

export function nextExhibition(state) {
  const entries=state.contests.exhibitions ?? [], last=entries.at(-1);
  return {round:entries.length+1,opensAt:last ? last.enteredAt+EXHIBITION_INTERVAL : 0};
}

export function validateExhibitions(state) {
  const entries=state.contests.exhibitions;
  if(entries===undefined)return;
  if(!Array.isArray(entries))throw new Error('专题赛历史格式无效');
  const individuals=new Map(state.individuals.map(individual=>[individual.id,individual]));
  let opensAt=0;
  state.contests.exhibitions=Array.from(entries,(result,index)=>{
    const card=exhibitionCard(state,index+1), entrant=individuals.get(result?.entrantId), at=result?.enteredAt;
    if(!entrant || entrant.legacy || !acceptsContestPattern(card,entrant) || !Number.isSafeInteger(at) || at<opensAt || at<entrant.adultAt || at>state.now ||
       (entrant.soldAt!==null && at>entrant.soldAt) || result.contestId!==card.id)throw new Error('专题赛历史与邀请或参赛虾不一致');
    const standing=contestStanding(card,entrant);
    if(result.score!==standing.score || result.rank!==standing.rank || result.rating!==standing.rating)throw new Error('专题赛成绩与本届评审不一致');
    opensAt=at+EXHIBITION_INTERVAL;
    return {contestId:card.id,entrantId:entrant.id,enteredAt:at,...standing};
  });
}
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function identifier(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) throw new TypeError('比赛或个体身份无效');
}

function timestamp(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('时间必须是非负安全整数毫秒');
}

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createContest({id, theme, tier, seed} = {}) {
  identifier(id);
  const fineBand = theme === FINE_BAND;
  const fineBandId = exhibitionRound(id) > 0 && id.endsWith(':' + FINE_BAND);
  if (fineBand !== fineBandId || (!fineBand && !THEMES.includes(theme))) throw new RangeError('未知比赛主题或组别');
  if (!Object.hasOwn(BASELINES, tier)) throw new RangeError('未知比赛级别');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('比赛种子必须是 uint32');
  const rng = seededRandom(seed);
  const npcs = BASELINES[tier].map((quality, i) => {
    const parent = [quality, fineBand ? 10 - quality : quality, quality];
    return {id:`npc-${i + 1}`, ...generateOffspring(parent, parent, rng)};
  });
  return {version:1, id, theme, tier, seed, npcs};
}

export function validateContest(contest) {
  if (!plain(contest) || contest.version !== 1) throw new TypeError('比赛快照版本无效');
  const expected = createContest(contest);
  if (!Array.isArray(contest.npcs) || contest.npcs.length !== 3) throw new TypeError('比赛必须保留三个固定对手');
  for (let i = 0; i < 3; i++) {
    const npc = contest.npcs[i], original = expected.npcs[i];
    if (!plain(npc) || npc.id !== original.id || npc.sex !== original.sex) throw new TypeError('比赛对手身份无效');
    for (const key of ['B', 'P']) {
      scoreShrimp(npc[key], contest.theme);
      if (!npc[key].every((value, index) => value === original[key][index])) throw new TypeError('比赛对手与固定种子不一致');
    }
  }
  return expected;
}

const rankFor = (contest, score) => 1 + contest.npcs.filter(npc => scoreShrimp(npc.P, contest.theme) > score).length;

export function contestStanding(card, individual) {
  const score = scoreShrimp(individual.P, card.theme);
  return {score, rank:rankFor(card,score), rating:rateScore(score)};
}

// A keeper chooses the members of each notebook. Living and archived individuals
// have the same claim to a result, but only an actual entry appears here.
export function lineContestHistory(state, book) {
  const ids = new Set([book.founderId, ...book.members]);
  const members = state.individuals.filter(individual => ids.has(individual.id));
  const shows = [];
  for (const card of state.contests.cards) {
    const entries = [];
    for (const member of members) {
      if (!Object.hasOwn(member.contestDebuts ?? {}, card.id)) continue;
      entries.push({entrantId:member.id, enteredAt:member.contestDebuts[card.id], ...contestStanding(card, member)});
    }
    if (entries.length) {
      entries.sort((a, b) => a.enteredAt - b.enteredAt);
      shows.push({id:card.id, card, entries});
    }
  }
  for (const [index, brood] of state.batches.entries()) {
    if (ids.has(brood.rookieEntry?.entrantId)) {
      shows.push({id:'rookie:'+brood.id, broodNumber:index+1, entries:[brood.rookieEntry]});
    }
  }
  for (const entry of state.contests.exhibitions ?? []) {
    if (ids.has(entry.entrantId)) shows.push({id:entry.contestId, entries:[entry]});
  }
  return shows;
}

// Event cards already fix each rival's sex and judging traits. Give its portrait
// a separate repeatable look without consuming the competition or breeding RNG.
export function contestLineup(card, entrant) {
  const rivals = card.npcs.map(npc => {
    const id = `show-v1/${card.id}/${card.seed}/${npc.id}`;
    const draw = seededRandom(stableSeed(id));
    return {id, sex:npc.sex, P:npc.P, adultAt:0,
      colour:COLOURS_V1[Math.floor(draw() * COLOURS_V1.length)],
      pattern:card.theme === FINE_BAND ? 'band' : PATTERNS_V1[Math.floor(draw() * PATTERNS_V1.length)]};
  });
  const entries = [entrant, ...rivals].map((record, number) => ({
    number, record, score:scoreShrimp(record.P, card.theme),
  }));
  return entries.map(entry => ({...entry,
    rank:1 + entries.filter(other => other.score > entry.score).length,
    tied:entries.some(other => other.number !== entry.number && other.score === entry.score),
  }));
}

export function parentContestMarks(card, individual, archive) {
  const marks=[];
  for (const id of individual.parents??[]) {
    const parent=archive.find(r=>r.id===id);
    if (!parent || !Object.hasOwn(parent.contestDebuts??{},card.id)) continue;
    const score=scoreShrimp(parent.P,card.theme);
    const gap=Object.hasOwn(individual.contestDebuts??{},card.id) ? scoreShrimp(individual.P,card.theme)-score : null;
    marks.push({parent,score,gap});
  }
  return marks;
}

// Compare with the next higher score, or the strongest rival when the entrant leads.
export function rivalComparison(card, entrant) {
  const score = scoreShrimp(entrant.P,card.theme);
  const rivals = card.npcs.map((npc,index)=>({npc,index,score:scoreShrimp(npc.P,card.theme)})).sort((a,b)=>a.score-b.score);
  const rival = rivals.find(r=>r.score>score) ?? rivals.at(-1);
  const gap = score-rival.score;
  const weights = contestWeights(card.theme);
  const differences = weights.map((weight,i)=>(judgedTrait(entrant.P,card.theme,i)-judgedTrait(rival.npc.P,card.theme,i))*weight*Math.sign(gap));
  return {rival, gap, trait:gap===0 ? null : differences.indexOf(Math.max(...differences))};
}

// Adapter contract: id, B/P triples, adultAt (wall-clock ms), tank, soldAt.
export function evaluateContest(contest, individual, now) {
  const card = validateContest(contest);
  timestamp(now);
  if (!plain(individual)) throw new TypeError('参赛个体无效');
  identifier(individual.id);
  timestamp(individual.adultAt);
  if (individual.tank === null) throw new RangeError('已离缸的虾不能参赛');
  if (individual.tank === 'rest') throw new RangeError('静养的虾需接回鱼缸后再参赛');
  identifier(individual.tank);
  if (individual.soldAt !== null) {
    timestamp(individual.soldAt);
    throw new RangeError('已售出的虾不能参赛');
  }
  if (now < individual.adultAt) throw new RangeError('幼虾尚未成年');
  if (!acceptsContestPattern(card,individual)) throw new RangeError('细白带组只接受条带纹成虾');
  scoreShrimp(individual.B, card.theme);
  return {contestId:card.id, entrantId:individual.id, enteredAt:now, ...contestStanding(card,individual)};
}

export function emptyContestRecordbook() {
  return {version:1, bestByContest:{}, rewardedThemes:[]};
}

// Supply the complete permanent archive (including sold shrimp) for save validation.
export function validateContestRecordbook(recordbook, individuals, now) {
  if (!plain(recordbook) || recordbook.version !== 1 || !plain(recordbook.bestByContest) || !Array.isArray(recordbook.rewardedThemes)) throw new TypeError('比赛记录无效');
  if (now !== undefined) timestamp(now);
  let archive;
  if (individuals !== undefined) {
    if (!Array.isArray(individuals)) throw new TypeError('永久个体档案必须是数组');
    archive = new Map();
    for (const individual of individuals) {
      if (!plain(individual)) throw new TypeError('永久个体档案无效');
      identifier(individual.id);
      if (archive.has(individual.id)) throw new TypeError('永久个体档案身份重复');
      archive.set(individual.id, individual);
    }
  }
  if (new Set(recordbook.rewardedThemes).size !== recordbook.rewardedThemes.length || recordbook.rewardedThemes.some(theme => !THEMES.includes(theme))) throw new TypeError('比赛奖励记录无效');
  const entries = Object.entries(recordbook.bestByContest).map(([id, result]) => {
    if (!plain(result) || result.contestId !== id) throw new TypeError('比赛历史身份无效');
    identifier(result.entrantId);
    timestamp(result.enteredAt);
    if (now !== undefined && result.enteredAt > now) throw new RangeError('比赛历史发生在未来');
    const card = createContest({id, theme:result.theme, tier:result.tier, seed:result.seed});
    const rating = rateScore(result.score), rank = rankFor(card, result.score);
    if (result.rating !== rating || result.rank !== rank) throw new TypeError('比赛历史评分无效');
    if (archive) {
      const individual = archive.get(result.entrantId);
      if (!individual) throw new TypeError('比赛历史引用了未知个体');
      timestamp(individual.adultAt);
      if (individual.adultAt > result.enteredAt) throw new RangeError('比赛历史中的参赛虾尚未成年');
      if (individual.soldAt !== null) {
        timestamp(individual.soldAt);
        if (individual.soldAt < result.enteredAt) throw new RangeError('比赛历史中的参赛虾当时已出售');
        if (now !== undefined && individual.soldAt > now) throw new RangeError('参赛个体出售时间发生在未来');
      }
      if (scoreShrimp(individual.P, card.theme) !== result.score) throw new TypeError('比赛成绩与永久个体品质不一致');
    }
    return [id, {contestId:id, entrantId:result.entrantId, enteredAt:result.enteredAt, score:result.score, rank, rating, theme:card.theme, tier:card.tier, seed:card.seed}];
  });
  const playedThemes = new Set(entries.map(([, result]) => result.theme));
  if (recordbook.rewardedThemes.some(theme => !playedThemes.has(theme)) || [...playedThemes].some(theme => !recordbook.rewardedThemes.includes(theme))) throw new TypeError('比赛历史与奖励记录不一致');
  return {version:1, bestByContest:Object.fromEntries(entries), rewardedThemes:[...recordbook.rewardedThemes]};
}

// No money/storage mutation: the caller commits the returned book and reward together.
// Passing an individual (not a supplied score/result) makes every attempt recompute.
export function settleContest(recordbook, contest, individual, now) {
  const book = validateContestRecordbook(recordbook, undefined, now), card = validateContest(contest);
  if (card.theme === FINE_BAND) throw new RangeError('细白带组使用本届专题赛名额');
  const result = evaluateContest(card, individual, now);
  const previous = Object.hasOwn(book.bestByContest, card.id) ? book.bestByContest[card.id] : null;
  if (previous && (previous.theme !== card.theme || previous.tier !== card.tier || previous.seed !== card.seed)) throw new TypeError('同一比赛身份不能更换赛卡');
  if (!previous || result.score > previous.score) {
    book.bestByContest = {...book.bestByContest, [card.id]:{...result, theme:card.theme, tier:card.tier, seed:card.seed}};
  }
  const reward = book.rewardedThemes.includes(card.theme) ? 0 : 10;
  if (reward) book.rewardedThemes.push(card.theme);
  return {recordbook:book, result, reward};
}
