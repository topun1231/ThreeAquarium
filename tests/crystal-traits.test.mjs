import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAppearance, validateShrimpName, predictAppearance, offspringAppearance} from '../src/crystal-traits.js';

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
