import * as THREE from 'three';
import { BORDER_LIMIT, MIN_Y, MAX_Y } from '../core/config.js';

// 4 kızıl yarı-saydam duvar + nabız animasyonu.
// Sadece oyuncu 96 blok yaklaşınca görünür (performans).

export class WorldBorder {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    const H = MAX_Y - MIN_Y;
    const CY = (MAX_Y + MIN_Y) / 2;
    const L = BORDER_LIMIT * 2;
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff2222, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false, fog: false,
    });
    const geoX = new THREE.PlaneGeometry(L, H);
    const geoZ = new THREE.PlaneGeometry(L, H);
    this.walls = [];
    const mk = (geo, x, z, ry) => {
      const m = new THREE.Mesh(geo, mat.clone());
      m.position.set(x, CY, z); m.rotation.y = ry;
      m.visible = false; m.frustumCulled = false;
      this.group.add(m); this.walls.push(m);
    };
    mk(geoX, 0, -BORDER_LIMIT, 0);
    mk(geoX, 0, BORDER_LIMIT, 0);
    mk(geoZ, -BORDER_LIMIT, 0, Math.PI / 2);
    mk(geoZ, BORDER_LIMIT, 0, Math.PI / 2);
    scene.add(this.group);
    this.t = 0;
  }
  clamp(pos) {
    let hit = false;
    if (pos.x > BORDER_LIMIT - 1) { pos.x = BORDER_LIMIT - 1; hit = true; }
    if (pos.x < -BORDER_LIMIT + 1) { pos.x = -BORDER_LIMIT + 1; hit = true; }
    if (pos.z > BORDER_LIMIT - 1) { pos.z = BORDER_LIMIT - 1; hit = true; }
    if (pos.z < -BORDER_LIMIT + 1) { pos.z = -BORDER_LIMIT + 1; hit = true; }
    return hit;
  }
  distanceTo(px, pz) {
    return Math.min(
      BORDER_LIMIT - Math.abs(px),
      BORDER_LIMIT - Math.abs(pz)
    );
  }
  update(dt, px, pz) {
    this.t += dt;
    const d = this.distanceTo(px, pz);
    const show = d < 96;
    const pulse = 0.22 + 0.12 * Math.sin(this.t * 4);
    for (const w of this.walls) {
      w.visible = show;
      if (show) w.material.opacity = d < 16 ? pulse + 0.15 : pulse;
    }
    return { show, dist: d, blocked: d < 2 };
  }
}
