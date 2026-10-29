// Point lights (tiki torches, camp fires, the torch in hand): the 8 closest to
// the camera are sent to every world shader, with a lively flicker. They are
// faint by day and take over at night.
import { globals, MAX_LIGHTS } from './shaders.js';

export class Lights {
  constructor() { this.list = new Set(); }
  add(l) { l.phase ??= Math.random() * 100; this.list.add(l); return l; }
  remove(l) { this.list.delete(l); }

  update(cam, t) {
    const night = globals.uNight.value;
    const k = 0.05 + 0.95 * Math.max(night, globals.uRain.value * 0.45);
    const near = [];
    for (const l of this.list) {
      if (l.off) continue;
      const d = Math.hypot(l.x - cam.x, l.y - cam.y, l.z - cam.z);
      if (d < l.radius + 60) near.push([d, l]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const n = Math.min(MAX_LIGHTS, near.length);
    for (let i = 0; i < n; i++) {
      const l = near[i][1];
      const f = 1 + (Math.sin(t * 9.1 + l.phase) * 0.5 + Math.sin(t * 23.7 + l.phase * 2.3) * 0.35) * 0.09 * (l.flicker ?? 1);
      globals.uLightPos.value[i].set(l.x, l.y, l.z, l.radius * (0.97 + 0.03 * f));
      globals.uLightCol.value[i].set(l.r * k * f, l.g * k * f, l.b * k * f, 0);
    }
    globals.uLightN.value = n;
  }

  // how much fire light reaches a point (for the held item tint)
  at(x, y, z) {
    let s = 0;
    for (const l of this.list) {
      if (l.off) continue;
      const a = Math.max(0, 1 - Math.hypot(l.x - x, l.y - y, l.z - z) / l.radius);
      s += a * a;
    }
    return Math.min(1, s) * (0.12 + 0.88 * globals.uNight.value);
  }
}
