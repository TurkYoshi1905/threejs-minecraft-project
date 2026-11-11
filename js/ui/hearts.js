// MC tarzı kalp spriteları.
// Faithful 1.21.1 (CC-BY-NC) kalp sprite'ları textures/hud/heart_*.png altından yüklenir.
// MC 1.21.1 mantığı: 20 HP (10 kalp), yarım kalp desteği, "container" = boş kalp.

let cache = null;
export function heartIcons() {
  if (!cache) {
    cache = {
      full: 'textures/hud/heart_full.png',
      half: 'textures/hud/heart_half.png',
      empty: 'textures/hud/heart_container.png',
      fullBlinking: 'textures/hud/heart_full_blinking.png',
      halfBlinking: 'textures/hud/heart_half_blinking.png',
      emptyBlinking: 'textures/hud/heart_container_blinking.png',
    };
  }
  return cache;
}
