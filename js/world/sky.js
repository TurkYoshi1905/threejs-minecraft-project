import * as THREE from 'three';

// Güneş + Ay (kare, MC tarzı canvas dokular) + gece yıldızları.
// Konumlar timeOfDay açısıyla senkron (main.js'teki ışık hesabıyla aynı açı).

function sunTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const glow = g.createRadialGradient(16, 16, 4, 16, 16, 16);
  glow.addColorStop(0, 'rgba(255,230,120,1)');
  glow.addColorStop(0.55, 'rgba(255,210,80,0.85)');
  glow.addColorStop(1, 'rgba(255,200,60,0)');
  g.fillStyle = glow; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#ffe27a'; g.fillRect(8, 8, 16, 16); // kare güneş
  g.fillStyle = '#fff6c8'; g.fillRect(10, 10, 5, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function moonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const glow = g.createRadialGradient(16, 16, 4, 16, 16, 16);
  glow.addColorStop(0, 'rgba(220,228,240,0.9)');
  glow.addColorStop(0.6, 'rgba(200,210,230,0.35)');
  glow.addColorStop(1, 'rgba(200,210,230,0)');
  g.fillStyle = glow; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#dde3ea'; g.fillRect(9, 9, 14, 14); // kare ay
  g.fillStyle = '#b9c2cf';
  g.fillRect(12, 12, 3, 3); g.fillRect(17, 15, 2, 2); g.fillRect(13, 18, 2, 2); // kraterler
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Sky {
  constructor(scene) {
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTexture(), transparent: true, fog: false, depthWrite: false,
    }));
    this.sun.scale.set(110, 110, 1);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: moonTexture(), transparent: true, fog: false, depthWrite: false,
    }));
    this.moon.scale.set(80, 80, 1);
    // yıldızlar: üst yarımküreye dağılmış noktalar
    const N = 500;
    const pos = new Float32Array(N * 3);
    let seed = 987654321;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) {
      const th = rnd() * Math.PI * 2;
      const ph = rnd() * Math.PI * 0.48; // ufuktan tepeye
      const R = 800;
      pos[i * 3] = Math.cos(th) * Math.cos(ph) * R;
      pos[i * 3 + 1] = Math.sin(ph) * R + 20;
      pos[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * R;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xffffff, size: 2.2, sizeAttenuation: false,
      transparent: true, fog: false, depthWrite: false,
    }));
    this.stars.frustumCulled = false;
    scene.add(this.sun); scene.add(this.moon); scene.add(this.stars);
  }
  update(ang, dayF, camPos) {
    const D = 700;
    const sx = Math.sin(ang), sy = Math.cos(ang);
    this.sun.position.set(camPos.x + sx * D, camPos.y + sy * D, camPos.z + 150);
    this.moon.position.set(camPos.x - sx * D, camPos.y - sy * D, camPos.z + 150);
    this.sun.material.opacity = Math.max(0, Math.min(1, dayF * 2));
    this.sun.visible = sy > -0.2;
    this.moon.material.opacity = Math.max(0, Math.min(1, (1 - dayF) * 2));
    this.moon.visible = sy < 0.2;
    this.stars.position.copy(camPos);
    this.stars.material.opacity = Math.max(0, Math.min(1, 1 - dayF * 1.8));
    this.stars.visible = this.stars.material.opacity > 0.02;
  }
}
