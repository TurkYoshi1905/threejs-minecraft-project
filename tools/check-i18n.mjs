#!/usr/bin/env node
// i18n bütünlük kapısı — CI/geliştirme için:
//   1) Her blok ve eşyada `ad` (TR) ve `adEn` (EN) tanımlı mı?
//   2) LANGS.tr ve LANGS.en anahtar kümeleri birebir aynı mı?
//   3) ${...} yer tutucu sayıları iki dilde eşit mi?
// Kullanım: node tools/check-i18n.mjs   (exit 1 = eksik var)
import { BLOCKS } from '../js/world/blocks.js';
import { ITEMS } from '../js/world/items.js';
import { LANGS } from '../js/core/i18n.js';

let errors = 0;
const fail = (msg) => { console.error('  ✗ ' + msg); errors++; };

console.log('i18n bütünlük kontrolü…\n');

console.log('[1/3] Blok/eşya ad çevirileri');
for (const [id, b] of Object.entries(BLOCKS)) {
  if (!b.ad || !String(b.ad).trim()) fail(`BLOCKS[${id}] 'ad' (TR) eksik`);
  if (!b.adEn || !String(b.adEn).trim()) fail(`BLOCKS[${id}] 'adEn' (EN) eksik — "${b.ad}"`);
}
for (const [id, b] of Object.entries(ITEMS)) {
  if (!b.ad || !String(b.ad).trim()) fail(`ITEMS[${id}] 'ad' (TR) eksik`);
  if (!b.adEn || !String(b.adEn).trim()) fail(`ITEMS[${id}] 'adEn' (EN) eksik — "${b.ad}"`);
}
if (errors === 0) console.log(`  ✓ ${Object.keys(BLOCKS).length} blok + ${Object.keys(ITEMS).length} eşya — hepsi iki dilli`);

console.log('[2/3] TR/EN anahtar eşliği');
const trKeys = Object.keys(LANGS.tr);
const enKeys = Object.keys(LANGS.en);
const enSet = new Set(enKeys);
const trSet = new Set(trKeys);
let keyErrors = 0;
for (const k of trKeys) if (!enSet.has(k)) { fail(`LANGS.en eksik anahtar: ${k}`); keyErrors++; }
for (const k of enKeys) if (!trSet.has(k)) { fail(`LANGS.tr eksik anahtar: ${k}`); keyErrors++; }
if (keyErrors === 0) console.log(`  ✓ ${trKeys.length} anahtar iki dilde de tam`);

console.log('[3/3] Yer tutucu ({n}) uyumu');
let phErrors = 0;
for (const k of trKeys) {
  const trPh = (String(LANGS.tr[k]).match(/\{\d+\}/g) || []).sort().join(',');
  const enPh = (String(LANGS.en[k]).match(/\{\d+\}/g) || []).sort().join(',');
  if (trPh !== enPh) { fail(`"${k}" yer tutucuları farklı: TR [${trPh}] ≠ EN [${enPh}]`); phErrors++; }
}
if (phErrors === 0) console.log('  ✓ Yer tutucular uyumlu');

console.log('');
if (errors > 0) {
  console.error(`i18n KONTROLÜ BAŞARISIZ — ${errors} sorun bulundu.`);
  process.exit(1);
}
console.log('i18n kontrolü temiz. ✓');
