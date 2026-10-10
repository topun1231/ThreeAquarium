import test from 'node:test';
import assert from 'node:assert/strict';
import {FLORA_CATALOG,SPECIES,parsePlantKind,sanitizeFlora} from '../src/flora.js';
import {FLORA_TRADE,floraCatalogLabel,floraSpeciesLabel,plantRecordLabel,unityPlantName,UNITY_PLANT_LABELS} from '../src/plant-names.js';

test('catalog uses aquarium-trade names and only real authored Anubias meshes', () => {
  assert.deepEqual(UNITY_PLANT_LABELS, ['小圆叶', '椒草', '牛毛毡']);
  assert.equal(unityPlantName('mvp001a-background-stem-prototype'), '小圆叶');
  assert.equal(unityPlantName(2), '牛毛毡');
  assert.equal(FLORA_CATALOG.filter(r => r.species === 'pala').length, 3);
  assert.equal(FLORA_CATALOG.filter(r => r.species === 'nullified').length, 1);
  assert.equal(FLORA_CATALOG.length, 16);
  assert.ok(FLORA_CATALOG.some(r => r.id === 'flora:pala:0' && r.label === '纳纳小榕 · 大叶'));
  assert.ok(FLORA_CATALOG.some(r => r.id === 'flora:pala:1' && r.label === '纳纳小榕 · 小叶'));
  assert.ok(FLORA_CATALOG.some(r => r.id === 'flora:pala:2' && r.label === '纳纳小榕 · 中叶'));
  assert.equal(FLORA_CATALOG.find(r => r.species === 'nullified').label, '巴氏榕');
  assert.ok(FLORA_CATALOG.some(r => r.label === '幼苗莫丝'));
  assert.ok(FLORA_CATALOG.some(r => r.label === '美丽莫丝'));
  assert.ok(FLORA_CATALOG.every(r => !/Pala|Nullified|甲|乙|丙|丁|后景茎草|中景阔叶|前景细叶/i.test(r.label)));
  assert.ok(!FLORA_CATALOG.some(r => r.species === 'anubias'));
  assert.equal(SPECIES.pala.label, '纳纳小榕');
  assert.equal(SPECIES.nullified.label, '巴氏榕');
  assert.equal(floraSpeciesLabel('rotala'), '红宫廷');
  assert.equal(floraCatalogLabel('carpet', 2), '矮珍珠 · 密垫');
});

test('old saves keep pala/nullified IDs and wrapped variants', () => {
  const old = {UniqueId:'old-plant', Species:'anubias', Variant:3, Yaw:0.2, Scale:1, Hue:0, Nodes:6, Host:'wood', Local:[0, 0.01, 0], Normal:[0, 1, 0]};
  const migrated = sanitizeFlora([old])[0];
  assert.ok(['pala', 'nullified'].includes(migrated.Species));
  assert.equal(migrated.Variant, 3);
  assert.equal(parsePlantKind('flora:pala:3').variant, 3);
  assert.equal(plantRecordLabel(migrated), floraCatalogLabel(migrated.Species, 3));
  assert.doesNotMatch(plantRecordLabel(migrated), /Pala|Nullified/);
});
