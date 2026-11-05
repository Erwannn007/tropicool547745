// Colour ramps of the metals the tools can be made of. The tool heads are
// painted with five steel shades in their vertex colours (dark poll, eye,
// cheeks, honed bevel, bright edge: axeModel.js, models.js); a copper, iron
// or obsidian tool swaps each shade for the same step of its own ramp.
import * as THREE from 'three';

// the ramps are display colours, like the steel shades: no sRGB decoding
const hex = (h) => { const c = new THREE.Color().setStyle(h, THREE.NoColorSpace); return [c.r, c.g, c.b]; };
export const STEEL = [[0.32, 0.37, 0.47], [0.4, 0.45, 0.55], [0.5, 0.56, 0.65], [0.72, 0.77, 0.85], [0.96, 0.98, 1.0]];
export const METALS = {
  // red copper, darker where it is thick, pale pink-gold on the honed edge
  copper: ['#6a2e14', '#94481e', '#c06a30', '#e89a5a', '#ffd6a8'].map(hex),
  // forged iron: blue-black from the hammer, bright steel only on the edge
  iron: ['#363a46', '#4a505e', '#5e6676', '#929cb0', '#eef2fa'].map(hex),
  // volcanic glass: black with a violet sheen, a lilac glint along the edge
  obsidian: ['#1c1628', '#2c2440', '#40345a', '#7262a8', '#ddd0ff'].map(hex),
  // gold (fittings of the golden rod)
  gold: ['#7a4e0e', '#a87218', '#d09a28', '#ecc040', '#fff4c0'].map(hex),
};

// nearest steel step of a colour (the eye's lit top is steel * 1.12)
function stepOf(r, g, b) {
  let best = 0, bd = Infinity;
  STEEL.forEach((s, k) => {
    for (const m of [1, 1.12]) {
      const d = (s[0] * m - r) ** 2 + (s[1] * m - g) ** 2 + (s[2] * m - b) ** 2;
      if (d < bd) { bd = d; best = k + (m > 1 ? 0.5 : 0); }
    }
  });
  return best;
}

// a copy of a steel-coloured geometry repainted in another metal (null: steel)
export function inMetal(geo, metal) {
  if (!metal || !METALS[metal]) return geo;
  const g = geo.clone(), C = g.attributes.color, R = METALS[metal];
  const col = new Float32Array(C.count * 3);
  for (let i = 0; i < C.count; i++) {
    const k = stepOf(C.getX(i), C.getY(i), C.getZ(i)), lo = R[Math.floor(k)], hi = R[Math.min(4, Math.ceil(k))];
    for (let j = 0; j < 3; j++) col[i * 3 + j] = (lo[j] + hi[j]) / 2;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// repaint a geometry in place from its original steel colours
export function repaint(geo, steelCols, metal) {
  const C = geo.attributes.color, R = metal && METALS[metal];
  for (let i = 0; i < C.count; i++) {
    const r = steelCols[i * 3], g = steelCols[i * 3 + 1], b = steelCols[i * 3 + 2];
    if (!R) { C.setXYZ(i, r, g, b); continue; }
    const k = stepOf(r, g, b), lo = R[Math.floor(k)], hi = R[Math.min(4, Math.ceil(k))];
    C.setXYZ(i, (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
  }
  C.needsUpdate = true;
}
