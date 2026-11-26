/** Player-facing aquarium-trade names. Internal IDs (pala, nullified, TypeId) stay in saves. */

export const UNITY_PLANT_NAMES = {
  'mvp001a-background-stem-prototype': '小圆叶',
  'plantset001-midground-broadleaf': '椒草',
  'plantset001-foreground-finegrass': '牛毛毡',
};

export const UNITY_PLANT_LABELS = ['小圆叶', '椒草', '牛毛毡'];

export const FLORA_TRADE = {
  rotala: {label: '红宫廷', variants: ['细叶', '中叶', '宽叶', '高茎']},
  carpet: {label: '矮珍珠', variants: ['疏丛', '低垫', '密垫', '丘丛']},
  moss: {label: '莫丝', variants: ['幼苗莫丝', '莫丝', '美丽莫丝', '密丛莫丝'], full: true},
  pala: {label: '纳纳小榕', variants: ['大叶', '小叶', '中叶']},
  nullified: {label: '巴氏榕', variants: ['']},
  javafern: {label: '爪哇蕨', variants: ['']},
  vallisneria: {label: '苦草', variants: ['']},
  browncrypt: {label: '棕色温蒂椒草', variants: ['']},
};

export function unityPlantName(typeIdOrIndex, definitions) {
  if (typeof typeIdOrIndex === 'number') {
    const typeId = definitions?.[typeIdOrIndex]?.TypeId;
    return (typeId && UNITY_PLANT_NAMES[typeId]) || UNITY_PLANT_LABELS[typeIdOrIndex] || '水草';
  }
  return UNITY_PLANT_NAMES[typeIdOrIndex] || '水草';
}

export function floraCatalogLabel(species, variant = 0) {
  const trade = FLORA_TRADE[species];
  if (!trade) return '水草';
  const marks = trade.variants || [''];
  const mark = marks[variant] ?? marks[variant % marks.length] ?? '';
  if (trade.full) return mark || trade.label;
  return mark ? `${trade.label} · ${mark}` : trade.label;
}

export function floraSpeciesLabel(species) {
  return FLORA_TRADE[species]?.label || '水草';
}

export function catalogVariantCount(species) {
  return FLORA_TRADE[species]?.variants?.length || 0;
}

export function plantRecordLabel(record, definitions) {
  if (record?.Species) return floraCatalogLabel(record.Species, record.Variant);
  if (record?.TypeId) return unityPlantName(record.TypeId, definitions);
  return '水草';
}
