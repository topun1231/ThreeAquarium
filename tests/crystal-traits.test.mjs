import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAppearance, validateShrimpName, predictAppearance, offspringAppearance, matchesShrimpSearch, broodAlternatives, broodQualityTarget} from '../src/crystal-traits.js';

test('双目标落空时可分开比较花色与品质，按可见分数保留并列',()=>{
  const kid=(id,pattern,score)=>({id,colour:'red',pattern,P:[6,score,5]});
  const a=kid('a','band',7), b=kid('b','band',7.003), c=kid('c','mosura',8);
  const target=broodQualityTarget('coverage',c,a);
  const choices=(kids,goal)=>broodAlternatives(kids,goal,target).map(({kid,byLook})=>[kid.id,byLook]);
  assert.deepEqual(choices([c,a,b],'red:band'),[['a',true],['b',true],['c',false]]);
  assert.deepEqual(choices([a,b],'red:band'),[['a',true],['b',true]]);
  assert.deepEqual(choices([c,{id:'old',P:c.P}],'red:band'),[['c',false],['old',false]]);
  assert.deepEqual(choices([a,c,kid('hit','band',8.1)],'red:band'),[]);
  assert.deepEqual(choices([a,c],''),[]);
});

test('虾名、所在缸和连续输入的花色可以组合查找同一个体', () => {
  const fields=['墨点','黑晶 · 条带纹','繁育缸','I2'];
  assert.ok(matchesShrimpSearch('繁育缸 黑晶条带 墨点',...fields));
  assert.ok(matchesShrimpSearch('i2　黑晶 · 条带',...fields));
  assert.equal(matchesShrimpSearch('红晶条带 墨点',...fields),false);
});

const mother = {id:'mother', name:'小枫', colour:'red', pattern:'band', traitGroup:'crystal-game-v1'};
const father = {id:'father', name:'墨点', colour:'black', pattern:'hinomaru', traitGroup:'crystal-game-v1'};

test('game-like appearance branches are explicit and never invent a parent direction', () => {
  assert.deepEqual(predictAppearance(mother, father).colour, [{value:'red', probability:0.5}, {value:'black', probability:0.5}]);
  assert.deepEqual(predictAppearance(mother, {...father, colour:'red'}).colour, [{value:'red', probability:1}]);
  const colours = new Set(), patterns = new Set();
  for (let i = 0; i < 100; i++) {
    const child = offspringAppearance(mother, father, `crystal-${i}`);
    assert.deepEqual(child, offspringAppearance(mother, father, `crystal-${i}`));
    assert.ok(['red', 'black'].includes(child.colour)); assert.ok(['band', 'hinomaru'].includes(child.pattern));
    assert.ok(validateAppearance(child)); colours.add(child.colour); patterns.add(child.pattern);
  }
  assert.equal(colours.size, 2); assert.equal(patterns.size, 2);
  assert.deepEqual(offspringAppearance({}, {}, 'old'), {});
  assert.throws(() => predictAppearance(mother, {}), /不完整/);
});

test('invalid appearance and names reject without silent normalization', () => {
  for (const name of ['', ' ', ' 小虾', '小虾 ', '虾'.repeat(17), '小\n虾', null]) assert.throws(() => validateShrimpName(name));
  assert.equal(validateShrimpName('🦐'.repeat(16)), '🦐'.repeat(16));
  for (const patch of [{colour:'blue'}, {pattern:'unknown'}, {traitGroup:'wild-species'}, {colour:undefined}]) assert.throws(() => validateAppearance({...mother, ...patch}));
  assert.equal(validateAppearance({name:'旧记录'}), false);
});
