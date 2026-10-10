import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ADULT_AGE,BERRY_DAYS,babyName,biofilmRichness,careSummary,colonyTick,emptyColony,favoriteRoster,isFemale,noteTreat,parseShrimpName,relieveHunger,sanitizeColony,shrimpDetail,syncRoster,tankEntry,TREAT_BONUS} from '../src/care.js';
import {validateSession} from '../src/session.js';

const DAY = 86400;
const catalog = JSON.parse(fs.readFileSync(new URL('../public/assets/catalog.json', import.meta.url)));
const settings = JSON.parse(catalog.ground);
const defs = catalog.definitions.map(JSON.parse);
const source = JSON.parse(fs.readFileSync(new URL('../public/assets/setup.json', import.meta.url)));
const runtime = {definitions:defs, settings, entries:new Map(catalog.entries.map(entry => [entry.key, entry]))};
const agent = (id, {hunger = 0.2, stress = 0.1, state = 'Rest'} = {}) => ({data:{CreatureId:id, ExecutionState:state, Needs:{Hunger:hunger, Stress:stress, Fatigue:0.1}}});
const record = (name, extra = {}) => ({name, favorite:false, ageDays:ADULT_AGE, hatchAt:null, restUntil:0, ...extra});
const colonyOf = entries => ({shrimp:Object.fromEntries(entries), journal:[], treat:0});
const idFor = female => {
  for (let n = 0; n < 40; n++) {
    const id = `shrimp-${n}`;
    if (isFemale(id) === female) return id;
  }
  throw new Error('找不到对应性别的虾');
};

test('only a mature calm female in a living tank starts a 28-day berry', () => {
  const female = idFor(true), male = idFor(false), sim = 10 * DAY;
  const born = colonyTick(colonyOf([[female, record('小红')]]), [agent(female)], DAY, sim, {richness:0.8});
  assert.equal(born.hatches, 0);
  assert.equal(born.colony.shrimp[female].hatchAt, sim + BERRY_DAYS * DAY);
  assert.equal(born.colony.shrimp[female].name, '小红');
  assert.equal(agent(female).data.CreatureId, female);
  for (const [id, hunger, stress, age, richness] of [[male, 0.2, 0.1, ADULT_AGE, 0.8], [female, 0.8, 0.1, ADULT_AGE, 0.8], [female, 0.2, 0.5, ADULT_AGE, 0.8], [female, 0.2, 0.1, 10, 0.8], [female, 0.2, 0.1, ADULT_AGE, 0.1]]) {
    const colony = colonyOf([[id, record('虾', {ageDays:age})]]);
    const result = colonyTick(colony, [agent(id, {hunger, stress})], DAY, sim, {richness});
    assert.equal(result.colony.shrimp[id].hatchAt, null, id);
    assert.equal(result.hatches, 0);
  }
});

test('a berry hatches one juvenile after 28 days and not a day earlier', () => {
  const id = idFor(true), sim = 10 * DAY, shrimp = agent(id);
  const started = colonyTick(colonyOf([[id, record('小红', {favorite:true})]]), [shrimp], DAY, sim, {richness:0.8});
  const waiting = colonyTick(started.colony, [shrimp], 27 * DAY, sim + 27 * DAY, {richness:0.8});
  assert.equal(waiting.hatches, 0);
  assert.equal(waiting.colony.shrimp[id].hatchAt, sim + 28 * DAY);
  assert.equal(waiting.colony.shrimp[id].favorite, true);
  const hatched = colonyTick(waiting.colony, [shrimp], DAY, sim + 28 * DAY, {richness:0.8});
  assert.equal(hatched.hatches, 1);
  assert.equal(hatched.colony.shrimp[id].hatchAt, null);
  assert.deepEqual(Object.keys(hatched.colony.shrimp), [id]);
  assert.equal(shrimp.data.CreatureId, id);
});

test('sixty real seconds does not finish a hatch', () => {
  const id = idFor(true);
  const result = colonyTick(colonyOf([[id, record('小红')]]), [agent(id)], 60, 100000, {richness:0.8});
  assert.equal(result.hatches, 0);
  assert.equal(result.colony.shrimp[id].hatchAt, 100000 + BERRY_DAYS * DAY);
});

test('a full tank keeps the mother and drops the juvenile', () => {
  const agents = Array.from({length:50}, (_, index) => agent(`full-${index}`));
  const colony = emptyColony();
  colony.shrimp['full-0'] = record('老大', {hatchAt:0});
  const result = colonyTick(colony, agents, DAY, DAY, {richness:0.8});
  assert.equal(result.hatches, 0);
  assert.match(result.colony.journal.at(-1).text, /缸已满/);
  assert.equal(agents[0].data.CreatureId, 'full-0');
});

test('thirty-six shrimp do not start another berry', () => {
  const id = idFor(true);
  const agents = [agent(id), ...Array.from({length:35}, (_, index) => agent(`crowd-${index}`))];
  const result = colonyTick(colonyOf([[id, record('小红')]]), agents, DAY, 10 * DAY, {richness:0.8});
  assert.equal(agents.length, 36);
  assert.equal(result.colony.shrimp[id].hatchAt, null);
});

test('a treat helps once and does not shorten the berry', () => {
  const id = idFor(true), colony = colonyOf([[id, record('小红')]]);
  colony.treat = TREAT_BONUS;
  const helped = colonyTick(colony, [agent(id, {hunger:0.5})], DAY, 10 * DAY, {richness:0.25});
  assert.equal(helped.colony.shrimp[id].hatchAt, 10 * DAY + BERRY_DAYS * DAY);
  const again = noteTreat({shrimp:{}, journal:[], treat:TREAT_BONUS}, false);
  assert.equal(again.stacked, false);
  assert.equal(again.colony.treat, TREAT_BONUS);
  const first = noteTreat(emptyColony(), false);
  assert.equal(first.stacked, true);
  assert.equal(first.colony.treat, TREAT_BONUS);
  assert.equal(emptyColony().treat, 0);
  assert.equal(noteTreat(emptyColony(), true).stacked, false);
});

test('care text leads with condition and keeps hunger on the selected shrimp', () => {
  const id = idFor(true), sim = 10 * DAY;
  const calm = agent(id), grazing = agent('grazing', {state:'Graze'});
  const colony = colonyOf([[id, record('小红', {favorite:true, hatchAt:sim + 3 * DAY})], ['grazing', record('二号')]]);
  const text = careSummary([calm, grazing], colony, {simSeconds:sim, richness:0.8});
  assert.match(text, /^状态良好/);
  assert.match(text, /觅食中 1/);
  assert.match(text, /抱卵 1 只，约 3 天后孵出/);
  assert.match(text, /生态第 11 天/);
  assert.match(text, /收藏：★小红/);
  assert.doesNotMatch(text, /偏饿/);
  const detail = shrimpDetail(calm, colony.shrimp[id], sim);
  assert.match(detail, /★ 小红/);
  assert.match(detail, /饥饿 20%/);
  assert.match(detail, /约 3 天后孵出/);
  assert.deepEqual(favoriteRoster([grazing, calm], colony).map(item => item.id), [id]);
});

test('biofilm is a richness scalar, not a requirement to hand-feed', () => {
  assert.equal(biofilmRichness(), 0);
  const example = biofilmRichness({plants:89, hardscape:6, simSeconds:7 * DAY});
  assert.ok(example > 0.7 && example <= 1);
  const creatures = [{Needs:{Hunger:0.4}}];
  relieveHunger(creatures, 24, 0);
  assert.equal(creatures[0].Needs.Hunger, 0.4);
  relieveHunger(creatures, 24, 0.8);
  assert.equal(creatures[0].Needs.Hunger, 0.06);
});

test('shrimp names trim, allow Chinese, and reject empty or overlong text', () => {
  assert.equal(parseShrimpName('  小红  '), '小红');
  assert.equal(parseShrimpName('樱花虾'), '樱花虾');
  assert.equal(parseShrimpName('小 红'), '小 红');
  assert.equal(parseShrimpName('虾'.repeat(16)), '虾'.repeat(16));
  assert.throws(() => parseShrimpName('虾'.repeat(17)), /1–16/);
  assert.throws(() => parseShrimpName(''), /1–16/);
  assert.throws(() => parseShrimpName('   '), /1–16/);
  assert.throws(() => parseShrimpName('小\n红'), /无效/);
  assert.throws(() => parseShrimpName(12), /无效/);
});

test('names and favorites persist through a v4 session and old progress loads as defaults', () => {
  const id = 'stable-shrimp-id';
  const save = structuredClone(source);
  save.Colony = {shrimp:{[id]:{name:'  小红  ', favorite:true, ageDays:80}}, journal:[{day:2, text:'小红抱卵'}], treat:0.1};
  const loaded = validateSession(save, runtime);
  assert.equal(loaded.Colony.shrimp[id].name, '小红');
  assert.equal(loaded.Colony.shrimp[id].favorite, true);
  assert.equal(loaded.Colony.shrimp[id].ageDays, 80);
  assert.deepEqual(Object.keys(loaded.Colony.shrimp), [id]);
  const again = validateSession(JSON.parse(JSON.stringify(loaded)), runtime);
  assert.deepEqual(again.Colony.shrimp[id], loaded.Colony.shrimp[id]);
  const creatures = [{CreatureId:id}, {CreatureId:'other-shrimp'}];
  syncRoster(again.Colony, creatures.map(item => ({data:{CreatureId:item.CreatureId}})));
  assert.deepEqual(creatures.map(item => item.CreatureId), [id, 'other-shrimp']);
  assert.equal(again.Colony.shrimp[id].name, '小红');
  assert.equal(again.Colony.shrimp[id].favorite, true);
  assert.equal(again.Colony.shrimp['other-shrimp'].name, '2号');
  assert.equal(again.Colony.shrimp['other-shrimp'].favorite, false);
  assert.equal(again.Colony.shrimp['other-shrimp'].ageDays, ADULT_AGE);
  const legacy = structuredClone(source);
  legacy.Colony = {progress:0.4};
  assert.deepEqual(validateSession(legacy, runtime).Colony, emptyColony());
  assert.equal(validateSession(structuredClone(source), runtime).Colony, undefined);
  assert.throws(() => validateSession({...structuredClone(source), Colony:{progress:2}}, runtime));
  const named = structuredClone(source);
  named.Colony = {shrimp:{'abcd-stable':{ageDays:40}}, journal:[], treat:0};
  const defaults = validateSession(named, runtime).Colony.shrimp['abcd-stable'];
  assert.equal(defaults.name, 'abcd');
  assert.equal(defaults.favorite, false);
  assert.equal(sanitizeColony({progress:1}).shrimp && true, true);
  const fresh = emptyColony();
  fresh.shrimp.kept = record('幼虾1');
  assert.equal(babyName(fresh), '幼虾2');
  assert.equal(babyName(emptyColony()), '幼虾1');
  const invalid = structuredClone(source);
  invalid.Colony = {shrimp:{bad:{name:'', favorite:false}}, journal:[], treat:0};
  assert.throws(() => validateSession(invalid, runtime));
});

test('glass aim hits the near tank wall', () => {
  const hit = tankEntry({x:0, y:0.2, z:-2}, {x:0, y:0, z:1});
  assert.ok(Math.abs(hit.x) < 1e-9);
  assert.ok(Math.abs(hit.y - 0.2) < 1e-9);
  assert.ok(Math.abs(hit.z + 0.28) < 1e-9);
});
