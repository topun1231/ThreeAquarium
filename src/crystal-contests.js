import {generateOffspring, scoreShrimp, rateScore} from './crystal-genetics.js';

// Candidate difficulty, independent of the entrant. Persist the returned card.
const BASELINES = {entry:[5.5, 6, 6.5], advanced:[7, 7.5, 8]};
const THEMES = ['colour', 'pattern'];
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
  if (!THEMES.includes(theme)) throw new RangeError('未知比赛主题');
  if (!Object.hasOwn(BASELINES, tier)) throw new RangeError('未知比赛级别');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('比赛种子必须是 uint32');
  const rng = seededRandom(seed);
  const npcs = BASELINES[tier].map((quality, i) => {
    const parent = [quality, quality, quality];
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

// Adapter contract: id, B/P triples, adultAt (wall-clock ms), tank, soldAt.
export function evaluateContest(contest, individual, now) {
  const card = validateContest(contest);
  timestamp(now);
  if (!plain(individual)) throw new TypeError('参赛个体无效');
  identifier(individual.id);
  timestamp(individual.adultAt);
  if (individual.tank === null) throw new RangeError('已离缸的虾不能参赛');
  identifier(individual.tank);
  if (individual.soldAt !== null) {
    timestamp(individual.soldAt);
    throw new RangeError('已售出的虾不能参赛');
  }
  if (now < individual.adultAt) throw new RangeError('幼虾尚未成年');
  scoreShrimp(individual.B, card.theme);
  const score = scoreShrimp(individual.P, card.theme);
  return {contestId:card.id, entrantId:individual.id, enteredAt:now, score, rank:rankFor(card, score), rating:rateScore(score)};
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
