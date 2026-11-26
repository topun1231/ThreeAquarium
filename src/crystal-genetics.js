const INHERITED_OFFSETS = [-2, -1, -1, -1, -1, ...Array(14).fill(0), 1, 1, 1, 1, 2];
const INDIVIDUAL_OFFSETS = [-1, 0, 0, 0, 0, 1];
const clampQuality = value => Math.max(1, Math.min(9, value));

function validateQuality(values) {
  if (!Array.isArray(values) || values.length !== 3) throw new TypeError('品质必须是颜色、覆盖、边界三项数组');
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(values[i]) || values[i] < 1 || values[i] > 9) throw new RangeError('每项品质必须是 1–9 的有限数值');
  }
}

function draw(rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('随机源必须返回 [0, 1) 的有限数值');
  return value;
}

// The caller owns the seeded RNG and must persist these results when the batch forms.
export function generateOffspring(motherB, fatherB, rng) {
  validateQuality(motherB);
  validateQuality(fatherB);
  if (typeof rng !== 'function') throw new TypeError('必须提供随机源');
  const B = [], P = [];
  for (let i = 0; i < 3; i++) {
    const m = (motherB[i] + fatherB[i]) / 2, h = Math.max(m - 7, 0);
    const u = INHERITED_OFFSETS[Math.floor(draw(rng) * INHERITED_OFFSETS.length)];
    const e = INDIVIDUAL_OFFSETS[Math.floor(draw(rng) * INDIVIDUAL_OFFSETS.length)];
    B.push(clampQuality(m - 0.1 * h * h / 2 + u / (1 + 0.5 * h)));
    P.push(clampQuality(B[i] + e));
  }
  return {B, P, sex:draw(rng) < 0.5 ? 'female' : 'male'};
}

export const FINE_BAND = 'fine-band';
const colourWeights = Object.freeze([.5,.25,.25]), patternWeights = Object.freeze([.25,.25,.5]);
const fineBandWeights = Object.freeze([.25,.5,.25]);
export function contestWeights(theme) {
  if (theme === 'colour') return colourWeights;
  if (theme === 'pattern') return patternWeights;
  if (theme === FINE_BAND) return fineBandWeights;
  throw new RangeError('未知比赛主题');
}

// This class rewards a narrower white marking. The animal keeps its original coverage.
export function judgedTrait(P, theme, index) {
  return theme === FINE_BAND && index === 1 ? 10 - P[1] : P[index];
}

export function scoreShrimp(P, theme) {
  validateQuality(P);
  const weights = contestWeights(theme);
  return P[0] * weights[0] + judgedTrait(P, theme, 1) * weights[1] + P[2] * weights[2];
}

export function rateScore(score) {
  if (!Number.isFinite(score) || score < 1 || score > 9) throw new RangeError('评分必须是 1–9 的有限数值');
  return score >= 8 ? 'gold' : score >= 7 ? 'silver' : score >= 6 ? 'bronze' : 'participation';
}
