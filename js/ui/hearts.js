// MC tarzı kalp spriteları (9x9 piksel, canvas ile çizilir).
// Emoji değil gerçek piksel-art: container + full + half.

const MASK = [
  '001100110',
  '011111111',
  '111111111',
  '111111111',
  '011111110',
  '001111100',
  '000111000',
  '000010000',
  '000000000',
];

function edge(x, y) {
  if (!MASK[y] || MASK[y][x] !== '1') return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    return ny < 0 || ny > 8 || nx < 0 || nx > 8 || MASK[ny][nx] !== '1';
  });
}

function drawHeart(mode) {
  // mode: 'full' | 'half' | 'empty'
  const c = document.createElement('canvas');
  c.width = c.height = 9;
  const g = c.getContext('2d');
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      if (MASK[y][x] !== '1') continue;
      const left = x <= 3;
      const heartSide = mode === 'full' || (mode === 'half' && left);
      if (edge(x, y)) g.fillStyle = '#141414';
      else if (heartSide) {
        if ((x === 1 || x === 2) && y === 2) g.fillStyle = '#ffd7d7'; // parlama
        else if (y <= 2) g.fillStyle = '#ff4d4d';
        else if (y <= 5) g.fillStyle = '#f00000';
        else g.fillStyle = '#8f0000';
      } else g.fillStyle = '#3d0a0a'; // boş kap
      g.fillRect(x, y, 1, 1);
    }
  }
  return c.toDataURL();
}

let cache = null;
export function heartIcons() {
  if (!cache) cache = { full: drawHeart('full'), half: drawHeart('half'), empty: drawHeart('empty') };
  return cache;
}
