import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSET_CREDITS, creditsMarkup, CC_BY} from '../src/credits.js';

test('in-app credits list authors, CC BY 4.0, and a modified note', () => {
  const by = ASSET_CREDITS.filter(c => c.license === CC_BY);
  assert.ok(by.length >= 4);
  for (const c of by) {
    assert.ok(c.author);
    assert.equal(c.license.url, 'https://creativecommons.org/licenses/by/4.0/');
    assert.equal(c.modified, true);
  }
  assert.ok(ASSET_CREDITS.some(c => c.author === 'Pala' && c.use === '纳纳小榕'));
  assert.ok(ASSET_CREDITS.some(c => c.author === 'Nullified' && c.use === '巴氏榕'));
  const html = creditsMarkup();
  assert.match(html, /id="asset-credits"/);
  assert.match(html, /关于与署名/);
  assert.match(html, /creativecommons.org\/licenses\/by\/4.0/);
  assert.match(html, /已修改/);
  assert.match(html, /Pala/);
  assert.match(html, /Nullified/);
});
