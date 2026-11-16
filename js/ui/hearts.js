// MC 1.21.1 tarzı HUD ikonları.
// Faithful 1.21.1 (CC-BY-NC) sprite'ları textures/hud/*.png altından yüklenir.
//
// MC 1.21.1 çizim sırası (Minecraft Wiki "defraw_heart"):
//   ① container.png (koyu boş kalp) ARKAYA
//   ② full.png / half.png ÜSTÜNE
// Yani koyu şerit sprite'ın içinde değil, arkadaki koyu kalp siluetiyle oluşur.
// CSS gölge/filtre KULLANILMAZ (MC'de de yoktur) — sprite'lar 9x9, HUD ölçeği 2 (18px).

export const HUD_ICON_SIZE = 18; // MC GUI scale 2 -> 9x9 sprite = 18px

let cache = null;
export function heartIcons() {
  if (!cache) {
    cache = {
      full: 'textures/hud/heart_full.png',
      half: 'textures/hud/heart_half.png',
      empty: 'textures/hud/heart_container.png',      // MC'deki koyu arka katman
      fullBlinking: 'textures/hud/heart_full_blinking.png',
      halfBlinking: 'textures/hud/heart_half_blinking.png',
      emptyBlinking: 'textures/hud/heart_container_blinking.png',
    };
  }
  return cache;
}

let foodCache = null;
export function foodIcons() {
  if (!foodCache) {
    foodCache = {
      full: 'textures/hud/food_full.png',
      half: 'textures/hud/food_half.png',
      empty: 'textures/hud/food_empty.png',            // koyu arka katman (MC haunch outline)
      fullHungry: 'textures/hud/food_full_hunger.png',
      halfHungry: 'textures/hud/food_half_hunger.png',
      emptyHungry: 'textures/hud/food_empty_hunger.png',
    };
  }
  return foodCache;
}
