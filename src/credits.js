export const CC_BY = {name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/'};
export const CC0 = {name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/'};

export const ASSET_CREDITS = [
  {
    use: '纳纳小榕',
    work: 'Plants Anubias',
    author: 'Pala',
    url: 'https://sketchfab.com/3d-models/plants-anubias-2ba1d06a191b437e848b81b2981a9e02',
    license: CC_BY,
    modified: true,
  },
  {
    use: '巴氏榕',
    work: 'Aquariumplants like Anubia Barteri',
    author: 'Nullified',
    url: 'https://sketchfab.com/3d-models/aquariumplants-like-anubia-barteri-4dbbcb2abf864ee2af70ea7f2b2c691e',
    license: CC_BY,
    modified: true,
  },
  {
    use: '沉木',
    work: 'Branch of Driftwood',
    author: 'Arkify 3D',
    url: 'https://sketchfab.com/3d-models/branch-of-driftwood-5a82d7c30a5e4562ad583abff8f2e701',
    license: CC_BY,
    modified: true,
  },
  {
    use: '沉木',
    work: 'Driftwood Scan',
    author: 'HeartOfLines',
    url: 'https://sketchfab.com/3d-models/driftwood-scan-07422ed79cdd46c88aa5999486403804',
    license: CC_BY,
    modified: true,
  },
  {
    use: '石',
    work: 'Boulder 01 / Rock 07 / Rock 09',
    author: 'Rico Cilliers, Jenelle van Heerden / Poly Haven',
    url: 'https://polyhaven.com',
    license: CC0,
    modified: true,
  },
];

export function creditsMarkup() {
  const items = ASSET_CREDITS.map(c => {
    const change = c.modified ? '，已修改' : '';
    return `<li><a href="${c.url}" target="_blank" rel="noopener">${c.use}</a> · ${c.author} · <a href="${c.license.url}" target="_blank" rel="noopener">${c.license.name}</a>${change}</li>`;
  }).join('');
  return `<details id="asset-credits"><summary>关于与署名</summary><p class="credits-note">第三方模型按许可使用。CC BY 4.0 要求保留作者、许可链接，并标明修改。</p><ul class="credits-list">${items}</ul></details>`;
}
