// A tool blow that lands where the tool really meets something (pickaxe,
// axe): before the stroke the strike pose is aimed at what the crosshair
// shows, then a point of the tool (spec.tip) is swept through the world
// frame by frame and cast against it (no timed hit). On contact the tool
// stops right there and bounces back as hard as hooks.hit() says; through
// air it follows through further down.
// view: a HeldView (held.js) or the AxeModel: t, camera, pose(t), anim.keys
// (mutable copies of spec.keys: 0 idle, 1 raise, 2 hang, 3 strike, 4 recoil,
// 5 settle, then back up).
// spec: { keys, scale, pivot, tip, lock (end of the hang: the aim is fixed),
// end (strike pose passed and nothing met), reach }
// hooks: aim(reach) -> cast result or null, cast(o, dir, len), hit(c, dir)
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Blow {
  constructor(view, spec, hooks) {
    this.view = view; this.spec = spec; this.hooks = hooks;
    this.swing = null;
  }

  // held space <-> world: a held point maps onto the world ray through the
  // same pixel, at its held distance times k (k fixed for each stroke)
  toWorld(ph, camera, k) {
    const ndc = _v.copy(ph).project(this.view.camera);
    const dir = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
    return dir.multiplyScalar(ph.length() * k).add(camera.position);
  }
  // the point of the tool at time t of the stroke (held space)
  tipAt(t) {
    const { p, q } = this.view.pose(t);
    return this.spec.tip.clone().multiplyScalar(this.spec.scale).applyQuaternion(q).add(_v.set(...p)).clone();
  }

  // before the stroke: aim the strike pose at the spot under the crosshair
  aim(camera) {
    const v = this.view, { lock, reach } = this.spec;
    if (v.t < 0) { this.swing = null; return; }
    if (!this.swing || v.t < this.swing.t) this.swing = { t: 0, locked: false, struck: false, lastT: lock, k: 2 }; // new stroke (or chained)
    const sw = this.swing;
    sw.t = v.t;
    if (sw.locked || !v.anim?.contact) return;
    camera.updateMatrixWorld();
    v.camera.aspect = camera.aspect; v.camera.updateProjectionMatrix();
    const target = this.hooks.aim?.(reach);
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const point = target ? target.point : camera.position.clone().addScaledVector(dir, 1.9);
    const D = point.distanceTo(camera.position);
    const Hd = Math.max(0.56, Math.min(0.8, 0.44 + 0.15 * D));
    const ndc = point.clone().project(camera);
    const th = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(v.camera).normalize().multiplyScalar(Hd + 0.05); // a little past the surface
    sw.k = D / Hd; sw.target = target;
    this.solveStrike(th);
    if (v.t >= lock) sw.locked = true;
  }

  // turn the strike key about the grip so the point lands on th (held space)
  solveStrike(th) {
    const { keys: base, scale: s, pivot: pv, tip } = this.spec, keys = this.view.anim.keys;
    const G0 = new THREE.Vector3(...base[3].p).add(pv.clone().multiplyScalar(s).applyQuaternion(base[3].q));
    const T0 = new THREE.Vector3(...base[3].p).add(tip.clone().multiplyScalar(s).applyQuaternion(base[3].q));
    const v0 = T0.clone().sub(G0), R = v0.length();
    const Gp = G0.clone().addScaledVector(th.clone().sub(T0), 0.35); // the arm reaches a bit towards it
    const u = th.clone().sub(Gp).normalize();
    const G = th.clone().addScaledVector(u, -R);
    const r = new THREE.Quaternion().setFromUnitVectors(v0.divideScalar(R), u);
    const shift = G.clone().sub(G0);
    const place = (i, kr, ks) => {
      const rq = new THREE.Quaternion().slerp(r, kr);
      const q = rq.multiply(base[i].q);
      const g = new THREE.Vector3(...base[i].p).add(pv.clone().multiplyScalar(s).applyQuaternion(base[i].q)).addScaledVector(shift, ks);
      keys[i] = { ...base[i], q, p: g.sub(pv.clone().multiplyScalar(s).applyQuaternion(q)).toArray() };
    };
    place(1, 0.4, 0.3); place(2, 0.45, 0.35); place(3, 1, 1); place(4, 1, 1); place(5, 1, 0.9);
  }

  // during the stroke: sweep the point through the world, in small time
  // steps whatever the frame rate, up to the end of the stroke
  sweep(camera) {
    const sw = this.swing, v = this.view;
    if (!sw?.locked || sw.struck) return;
    camera.updateMatrixWorld();
    const end = Math.min(v.t, this.spec.end);
    let prev = this.toWorld(this.tipAt(sw.lastT), camera, sw.k), dir = new THREE.Vector3(0, -1, 0);
    for (let t = sw.lastT; t < end - 1e-6;) {
      const t1 = Math.min(end, t + 0.008);
      const tip = this.toWorld(this.tipAt(t1), camera, sw.k), seg = tip.clone().sub(prev), len = seg.length();
      if (len > 1e-5) {
        dir = seg.divideScalar(len);
        const c = this.hooks.cast?.(prev, dir, len);
        if (c) return this.strike(c, dir, t1);
      }
      prev = tip; t = t1;
    }
    sw.lastT = end;
    if (v.t < this.spec.end) return;
    // nothing met: a whiff, the tool follows through further down
    sw.struck = true;
    this.hooks.hit?.(null, dir);
    const keys = v.anim.keys, k2 = keys[2], k3 = keys[3];
    const d = k3.q.clone().multiply(k2.q.clone().invert());
    const q = new THREE.Quaternion().slerp(d, 0.3).multiply(k3.q);
    keys[4] = { ...keys[4], q, p: k3.p.map((x, j) => x + (x - k2.p[j]) * 0.15) };
    keys[5] = { ...keys[5], q: q.clone(), p: keys[4].p.slice() };
  }

  // the point met c at time t: the tool stops right there and bounces back
  strike(c, dir, t) {
    const v = this.view, keys = v.anim.keys;
    this.swing.struck = true;
    const here = v.pose(t);
    const at = { ...keys[3], p: here.p, q: here.q };
    const bounce = this.hooks.hit?.(c, dir) ?? 0;
    const back = (k, f) => ({ ...k, p: at.p.map((x, j) => x + (keys[2].p[j] - x) * f), q: at.q.clone().slerp(keys[2].q, f) });
    keys[3] = at;
    keys[4] = back(keys[4], 0.06 + bounce * 0.2);
    keys[5] = back(keys[5], 0.02 + bounce * 0.08);
    v.t = this.swing.t = keys[3].t; // (not a new stroke)
  }
}
