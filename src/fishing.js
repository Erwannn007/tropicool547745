// Fishing: held rod, casting arc, bobber, bites, catches and a fish journal.
import * as THREE from 'three';

export const SPECIES = [
  { name: 'Poisson-clown', d: [0, 2.2], w: 30, c: ['#ff7a1a', '#ffffff', '#1a1a1a'], s: [6, 11] },
  { name: 'Gobie des sables', d: [0, 2.5], w: 28, c: ['#d8c08a', '#f3e6c4', '#a08850'], s: [5, 12] },
  { name: 'Demoiselle bleue', d: [0, 3.2], w: 25, c: ['#2f7bff', '#9fd0ff', '#ffd23a'], s: [5, 9] },
  { name: 'Chirurgien jaune', d: [0.8, 5], w: 20, c: ['#ffd81f', '#fff3a0', '#ffffff'], s: [12, 20] },
  { name: 'Poisson-perroquet', d: [1.4, 8], w: 15, c: ['#3fd0a8', '#a8f0d8', '#ff7ab8'], s: [25, 60] },
  { name: 'Mérou corail', d: [3, 15], w: 12, c: ['#e8443a', '#ff9a8a', '#3a6fe0'], s: [30, 70] },
  { name: 'Carangue dorée', d: [3.5, 15], w: 10, c: ['#e8c45a', '#fff0b8', '#8a6a2a'], s: [35, 90] },
  { name: 'Barracuda', d: [5, 15], w: 7, c: ['#9aa8b8', '#e8eef4', '#4a5868'], s: [60, 140] },
  { name: 'Thon albacore', d: [7, 15], w: 5, c: ['#2a4a8a', '#d8dde8', '#ffd21a'], s: [60, 180] },
  { name: 'Poisson-lune', d: [8, 15], w: 1.5, c: ['#b8c4d0', '#eef2f6', '#8898a8'], s: [100, 250] },
  { name: 'Cœlacanthe', d: [10, 15], w: 0.6, c: ['#3a4a7a', '#7a8ac0', '#cfd8ff'], s: [120, 200] },
];
export const rarityOf = (w) => (w >= 20 ? 'Commun' : w >= 10 ? 'Peu commun' : w >= 5 ? 'Rare' : w >= 1 ? 'Très rare' : 'Légendaire');

const JKEY = 'tropicool.journal.v1';
export function loadJournal() {
  try { return JSON.parse(localStorage.getItem(JKEY)) || {}; } catch (_) { return {}; }
}
function saveJournal(j) { try { localStorage.setItem(JKEY, JSON.stringify(j)); } catch (_) { /* private mode */ } }

export class Fishing {
  constructor(scene, camera, tex, hooks) {
    this.scene = scene; this.camera = camera; this.hooks = hooks;
    this.state = 'idle';
    this.t = 0;
    this.journal = loadJournal();

    // rod held in view
    const rod = new THREE.Group();
    const corkMat = new THREE.MeshBasicMaterial({ color: 0xc89a5a });
    const blankMat = new THREE.MeshBasicMaterial({ map: tex.wood, color: 0xd8b080 });
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x2b2f3a });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.34, 6), corkMat);
    handle.position.y = 0.17;
    const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.02, 1.25, 5), blankMat);
    blank.position.y = 0.34 + 0.62;
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), darkMat);
    reel.rotation.z = Math.PI / 2; reel.position.set(0.04, 0.3, 0);
    rod.add(handle, blank, reel);
    this.tipLocal = new THREE.Vector3(0, 1.58, 0);
    this.rod = rod;
    this.rodHolder = new THREE.Group();
    this.rodHolder.add(rod);
    this.rodHolder.position.set(0.3, -0.36, -0.62);
    this.rodHolder.scale.setScalar(0.55);
    camera.add(this.rodHolder);

    // bobber
    const bob = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3b2f }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4), new THREE.MeshBasicMaterial({ color: 0xffe04a }));
    stick.position.y = 0.12;
    bob.add(top, bot, stick);
    bob.visible = false;
    scene.add(bob);
    this.bobber = bob;

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    this.line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf4f4f4, transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);

    // splash particles
    const pg = new THREE.BufferGeometry();
    this.splashN = 24;
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.splashN * 3), 3));
    this.splash = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09 }));
    this.splash.frustumCulled = false;
    this.splash.visible = false;
    this.splashVel = new Float32Array(this.splashN * 3);
    scene.add(this.splash);

    this.from = new THREE.Vector3(); this.target = new THREE.Vector3(); this.tip = new THREE.Vector3();
  }

  setWorld(world) { this.world = world; }

  findCastTarget() {
    const cam = this.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    // cast distance driven by pitch: look higher -> cast further
    const dist = THREE.MathUtils.clamp(10 + dir.y * 18, 5, 18);
    const t = cam.position.clone().addScaledVector(flat, dist);
    t.y = 0;
    const depth = -this.world.heightAt(t.x, t.z);
    return { point: t, depth };
  }

  splashAt(p, n = this.splashN) {
    const a = this.splash.geometry.attributes.position;
    for (let i = 0; i < this.splashN; i++) {
      a.setXYZ(i, p.x, 0.05, p.z);
      const ang = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.2;
      this.splashVel.set([Math.cos(ang) * sp, 1.5 + Math.random() * 2, Math.sin(ang) * sp], i * 3);
      if (i >= n) this.splashVel[i * 3 + 1] = -99;
    }
    a.needsUpdate = true;
    this.splash.visible = true;
    this.splashT = 0;
  }

  action(input) {
    if (this.state === 'idle') {
      const { point, depth } = this.findCastTarget();
      if (depth < 0.35) { this.hooks.message('Vise l\'eau pour lancer ta ligne 🎣'); return; }
      this.target.copy(point); this.castDepth = depth;
      this.state = 'casting'; this.t = 0;
      this.hooks.sound?.('cast');
    } else if (this.state === 'waiting') {
      this.reelIn('Ligne ramenée.');
    } else if (this.state === 'bite') {
      this.catchFish(input);
    }
  }

  reelIn(msg) {
    this.state = 'reeling'; this.t = 0;
    if (msg) this.hooks.message(msg);
  }

  catchFish(input) {
    const depth = this.castDepth;
    const pool = SPECIES.filter((s) => depth >= s.d[0] && depth <= s.d[1] + 0.5);
    let tot = pool.reduce((a, s) => a + s.w, 0), r = Math.random() * tot, pick = pool[0];
    for (const s of pool) { r -= s.w; if (r <= 0) { pick = s; break; } }
    const size = Math.round(pick.s[0] + Math.pow(Math.random(), 1.6) * (pick.s[1] - pick.s[0]));
    const j = this.journal[pick.name] || { count: 0, best: 0 };
    const isNew = j.count === 0, record = size > j.best;
    j.count++; j.best = Math.max(j.best, size);
    this.journal[pick.name] = j;
    saveJournal(this.journal);
    input.rumble(0.8, 260);
    this.hooks.sound?.('catch');
    this.hooks.caught({ ...pick, size, isNew, record: record && !isNew, rarity: rarityOf(pick.w) });
    this.splashAt(this.bobber.position);
    this.reelIn();
  }

  update(dt, input) {
    this.t += dt;
    const time = performance.now() / 1000;
    // idle sway of the rod
    const swing = this.state === 'casting' ? Math.sin(Math.min(1, this.t / 0.35) * Math.PI) : 0;
    this.rod.rotation.set(-0.75 - swing * 1.0 + Math.sin(time * 1.3) * 0.015, 0.1, 0.3 + (this.state === 'bite' ? Math.sin(time * 40) * 0.04 : 0));
    this.camera.updateMatrixWorld();
    this.tip.copy(this.tipLocal);
    this.rod.localToWorld(this.tip);

    const B = this.bobber.position;
    if (this.state === 'casting') {
      if (this.t < 0.3) { this.bobber.visible = false; this.line.visible = false; }
      else {
        const k = Math.min(1, (this.t - 0.3) / 0.65);
        if (!this.bobber.visible) this.from.copy(this.tip);
        this.bobber.visible = true;
        B.lerpVectors(this.from, this.target, k);
        B.y = THREE.MathUtils.lerp(this.from.y, 0, k) + Math.sin(k * Math.PI) * 3.2;
        if (k >= 1) {
          this.state = 'waiting'; this.t = 0;
          this.waitFor = 2.5 + Math.random() * 7;
          this.nibbles = Math.floor(Math.random() * 3);
          this.splashAt(B, 10);
          this.hooks.sound?.('plop');
        }
      }
    } else if (this.state === 'waiting') {
      B.y = Math.sin(time * 2.2) * 0.025;
      // little nibbles before the real bite
      if (this.nibbles > 0 && this.t > this.waitFor * (0.3 + 0.2 * this.nibbles) && this.t < this.waitFor * (0.3 + 0.2 * this.nibbles) + 0.15) {
        B.y -= 0.05;
      }
      if (this.t > this.waitFor) {
        this.state = 'bite'; this.t = 0;
        input.rumble(0.6, 180);
        this.hooks.bite(true);
        this.hooks.sound?.('bite');
        this.splashAt(B, 8);
      }
    } else if (this.state === 'bite') {
      B.y = -0.12 + Math.sin(time * 30) * 0.04;
      if (this.t > 1.1) {
        this.hooks.bite(false);
        this.reelIn('Oh non… le poisson s\'est échappé !');
      }
    } else if (this.state === 'reeling') {
      this.hooks.bite(false);
      const k = Math.min(1, this.t / 0.5);
      B.lerp(this.tip, k);
      if (k >= 1) { this.state = 'idle'; this.bobber.visible = false; }
    }

    this.line.visible = this.bobber.visible;
    if (this.line.visible) {
      const a = this.line.geometry.attributes.position;
      const slack = this.state === 'bite' ? 0.05 : 0.6;
      for (let i = 0; i < 16; i++) {
        const k = i / 15;
        const x = THREE.MathUtils.lerp(this.tip.x, B.x, k), z = THREE.MathUtils.lerp(this.tip.z, B.z, k);
        const y = THREE.MathUtils.lerp(this.tip.y, B.y + 0.12, k) - Math.sin(k * Math.PI) * slack;
        a.setXYZ(i, x, y, z);
      }
      a.needsUpdate = true;
    }

    if (this.splash.visible) {
      this.splashT += dt;
      const a = this.splash.geometry.attributes.position;
      for (let i = 0; i < this.splashN; i++) {
        const vy = this.splashVel[i * 3 + 1];
        if (vy < -50) { a.setY(i, -10); continue; }
        a.setXYZ(i, a.getX(i) + this.splashVel[i * 3] * dt, a.getY(i) + vy * dt, a.getZ(i) + this.splashVel[i * 3 + 2] * dt);
        this.splashVel[i * 3 + 1] -= 9 * dt;
      }
      a.needsUpdate = true;
      if (this.splashT > 0.8) this.splash.visible = false;
    }
  }

  get busy() { return this.state !== 'idle'; }
}
