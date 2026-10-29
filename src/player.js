// First-person walker: terrain + structure floors, trunk/rock colliders, wading
// and swimming in the lagoon.
import * as THREE from 'three';

const EYE = 1.62;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = -0.05;
    this.onGround = false;
    this.bob = 0;
    this.swimming = false;
    this.wading = 0;
    this.stepPhase = 0; this.swimT = 0;
    this.sound = null; // { step(surface, k), land(surface, speed), sfx(name) }
  }

  // what is under the feet: wood (pier/hut), water, rock, grass or sand
  surface() {
    if (this.swimming) return 'swim';
    if (this.wading > 0.06) return 'water';
    const w = this.world;
    if (this.pos.y > w.heightAt(this.pos.x, this.pos.z) + 0.15) return 'wood';
    const i = Math.max(0, Math.min(w.N - 1, Math.floor((this.pos.x / w.size + 0.5) * w.N)));
    const j = Math.max(0, Math.min(w.N - 1, Math.floor((this.pos.z / w.size + 0.5) * w.N)));
    if (w.rock[j * w.N + i] > 0.5) return 'rock';
    return w.grass[j * w.N + i] > 0.45 ? 'grass' : 'sand';
  }

  setWorld(world, colliders, surfaces) {
    this.world = world;
    this.surfaces = surfaces;
    this.grid = new Map();
    for (const c of colliders) {
      const k = `${Math.floor(c.x / 8)},${Math.floor(c.z / 8)}`;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(c);
    }
  }

  addCollider(c) {
    const k = `${Math.floor(c.x / 8)},${Math.floor(c.z / 8)}`;
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push(c);
  }
  removeColliderObj(c) {
    const list = this.grid.get(`${Math.floor(c.x / 8)},${Math.floor(c.z / 8)}`);
    const i = list ? list.indexOf(c) : -1;
    if (i >= 0) list.splice(i, 1);
  }
  // is a circle at (x, z) overlapping a trunk, rock, post or placed object?
  blocked(x, z, r) {
    const cx = Math.floor(x / 8), cz = Math.floor(z / 8);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      for (const c of this.grid.get(`${cx + i},${cz + j}`) || []) if (Math.hypot(c.x - x, c.z - z) < c.r + r) return true;
    }
    return false;
  }

  removeCollider(prop) {
    const list = this.grid.get(`${Math.floor(prop.x / 8)},${Math.floor(prop.z / 8)}`);
    if (list) { const i = list.findIndex((c) => c.prop === prop); if (i >= 0) list.splice(i, 1); }
  }

  spawn(s) {
    this.pos.set(s.x, s.y, s.z);
    this.vel.set(0, 0, 0);
    this.yaw = s.yaw; this.pitch = -0.04;
  }

  groundAt(x, z, currentY = Infinity) {
    let g = this.world.heightAt(x, z);
    for (const s of this.surfaces) {
      const dx = x - s.cx, dz = z - s.cz;
      const along = dx * s.ax + dz * s.az, across = -dx * s.az + dz * s.ax;
      if (Math.abs(along) <= s.hl && Math.abs(across) <= s.hw && s.y <= currentY + 0.6) g = Math.max(g, s.y);
    }
    return g;
  }

  update(dt, input, lookDelta, frozen = false) {
    this.yaw -= lookDelta.x;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - lookDelta.y));

    const water = 0;
    let speed = input.sprint ? 7.2 : 4.2;
    const terrainH = this.world.heightAt(this.pos.x, this.pos.z);
    const depth = water - terrainH;
    this.swimming = depth > 1.25 && this.pos.y < water - 0.9;
    this.wading = Math.max(0, Math.min(1, (water - this.pos.y) / 1.2));
    if (this.swimming) speed = 2.6; else speed *= 1 - this.wading * 0.45;
    if (frozen) speed = 0;

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const mvx = (fx * -input.move.y + rx * input.move.x) * speed;
    const mvz = (fz * -input.move.y + rz * input.move.x) * speed;
    const accel = this.onGround || this.swimming ? 14 : 3;
    this.vel.x += (mvx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (mvz - this.vel.z) * Math.min(1, accel * dt);

    if (input.pressed.has('jump') && !frozen && (this.onGround || this.swimming)) {
      this.vel.y = this.swimming ? 3.5 : 5.6;
      if (!this.swimming) this.sound?.sfx('jump');
      this.onGround = false;
    }
    this.vel.y -= 16 * dt;

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    // circle colliders
    const r = 0.35;
    const cx = Math.floor(nx / 8), cz = Math.floor(nz / 8);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const list = this.grid.get(`${cx + i},${cz + j}`);
      if (!list) continue;
      for (const c of list) {
        const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m && d > 1e-4) { nx = c.x + dx / d * m; nz = c.z + dz / d * m; }
      }
    }
    const lim = this.world.size / 2 - 6;
    nx = Math.max(-lim, Math.min(lim, nx)); nz = Math.max(-lim, Math.min(lim, nz));
    // block steep climbs
    const gOld = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const gNew = this.groundAt(nx, nz, this.pos.y);
    if (gNew - gOld > 0.9 * Math.max(0.2, Math.hypot(nx - this.pos.x, nz - this.pos.z) * 4) && gNew > this.pos.y + 0.5) {
      nx = this.pos.x; nz = this.pos.z;
    }
    this.pos.x = nx; this.pos.z = nz;
    this.pos.y += this.vel.y * dt;

    const ground = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const wasGround = this.onGround, wasSwimming = this.swimming, fall = -this.vel.y;
    const floatY = water - 1.28;
    if (this.swimming || (ground < floatY && this.pos.y <= floatY)) {
      if (this.pos.y < floatY) { this.pos.y += (floatY - this.pos.y) * Math.min(1, 6 * dt); this.vel.y = Math.max(this.vel.y, 0) * 0.9; }
      this.onGround = false;
    }
    if (this.pos.y <= ground) {
      this.pos.y = ground; this.vel.y = 0; this.onGround = true;
    } else if (this.onGround && this.pos.y - ground < 0.35 && this.vel.y <= 0) {
      this.pos.y = ground; this.vel.y = 0; // stick to slopes when walking down
    } else {
      this.onGround = false;
    }

    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.5) this.bob += dt * hs * 1.9; else this.bob *= 0.9;

    // sounds: a footstep at each dip of the head bob, swim strokes, landings
    if (this.sound && !frozen) {
      const phase = Math.floor(this.bob / Math.PI + 0.25);
      if (this.onGround && hs > 0.5 && phase !== this.stepPhase) this.sound.step(this.surface(), Math.min(1, hs / 7));
      this.stepPhase = phase;
      if (this.swimming && hs > 0.5 && (this.swimT += dt) > 0.95) { this.swimT = 0; this.sound.step('swim'); }
      if (this.onGround && !wasGround && fall > 2.5) this.sound.land(this.surface(), fall);
      if (this.swimming && !wasSwimming && fall > 1) this.sound.sfx('splash');
    }
    const swimBob = this.swimming ? Math.sin(performance.now() * 0.002) * 0.08 : 0;

    this.camera.position.set(this.pos.x, this.pos.y + EYE + Math.sin(this.bob * 2) * 0.045 + swimBob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
