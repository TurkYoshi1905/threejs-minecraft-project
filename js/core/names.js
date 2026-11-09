// Dil-duyarlı blok/eşya isimleri: getLang() === 'en' ise adEn, yoksa ad
import { BLOCKS } from '../world/blocks.js';
import { ITEMS } from '../world/items.js';
import { getLang } from './i18n.js';

export function blockName(id) {
  const b = BLOCKS[id];
  if (!b) return '?';
  return getLang() === 'en' && b.adEn ? b.adEn : b.ad;
}
export function itemName(id) {
  const b = ITEMS[id];
  if (!b) return '?';
  return getLang() === 'en' && b.adEn ? b.adEn : b.ad;
}
export function nameOf(kind, id) {
  const k = kind || (id >= 100 ? 'item' : 'block');
  return k === 'item' ? itemName(id) : blockName(id);
}
