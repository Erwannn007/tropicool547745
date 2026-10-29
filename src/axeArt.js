// The axe's pixel art (64x64), painted procedurally. Besides colours, every
// pixel records which part it belongs to so the voxel model can give each
// part its own thickness (round handle, tapering blade, thick eye, rivets).

export const ART = 64;
export const PIVOT = [32, 58]; // grip point
export const PART = { NONE: 0, HANDLE: 1, WRAP: 2, POMMEL: 3, BLADE: 4, EYE: 5, POLL: 6, RIVET: 7, WEDGE: 8, OUTLINE: 9 };

export function paintAxe() {
  const S = ART;
  const rgba = new Uint8ClampedArray(S * S * 4);
  const parts = new Uint8Array(S * S);
  const extra = new Float32Array(S * S); // per-pixel thickness hint (blade taper)
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const set = (x, y, col, part, ex = 0) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const [r, g, b] = hex(col);
    const i = y * S + x;
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
    parts[i] = part; extra[i] = ex;
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // handle: hickory with highlight left / shadow right and grain
  const wood = ['#5e3a1a', '#8c5a2a', '#b77e3e', '#d9a25a', '#f0c27a', '#fbe0a6'];
  for (let y = 18; y <= 62; y++) {
    const w = y > 55 ? 7 : 6, x0 = 29 - (y > 55 ? 1 : 0);
    for (let k = 0; k < w; k++) {
      let shade = w === 6 ? [4, 3, 3, 2, 2, 1][k] : [1, 4, 3, 3, 2, 1, 0][k];
      if (rnd() < 0.18 && k > 0 && k < w - 1) shade -= 1;
      if (((x0 + k) * 3 + y) % 11 === 0 && k > 1 && k < w - 2) shade -= 1;
      set(x0 + k, y, wood[Math.max(0, Math.min(5, shade))], PART.HANDLE);
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = 30 + Math.floor(rnd() * 4), y0 = 22 + Math.floor(rnd() * 30), len = 3 + Math.floor(rnd() * 5);
    for (let y = y0; y < y0 + len && y < 44; y++) set(x, y, wood[1], PART.HANDLE);
  }
  // leather wrap
  const lea = ['#4a1e12', '#7a3a24', '#a8552f', '#c8743f'];
  for (let y = 44; y <= 55; y++) for (let x = 28; x <= 35; x++) {
    const band = (x + y) % 4;
    const k = x === 28 || x === 35 ? 0 : x === 29 ? 3 : band === 0 ? 0 : band === 1 ? 2 : 1 + (x < 32 ? 1 : 0);
    set(x, y, lea[k], PART.WRAP);
  }
  // pommel
  for (let y = 59; y <= 62; y++) for (let x = 27; x <= 36; x++) {
    if (y === 62 && (x < 28 || x > 35)) continue;
    set(x, y, x < 30 ? wood[3] : x > 33 ? wood[0] : wood[1], PART.POMMEL);
  }

  // blade: bearded, flaring left, bevelled edge
  const steel = ['#2e333d', '#4f5866', '#6f7a8a', '#8f9aaa', '#aeb8c6', '#c9d2de', '#e6edf5', '#ffffff'];
  const edgeX = (y) => 9 - 5 * Math.sin(Math.PI * (y - 3) / 29);
  for (let y = 3; y <= 32; y++) {
    const ex = Math.round(edgeX(y));
    for (let x = ex; x <= 28; x++) {
      const t = (x - ex) / (28 - ex);
      const top = 3 + 8 * Math.pow(t, 0.8), bot = 32 - 11 * Math.pow(t, 0.6);
      if (y < top || y > bot) continue;
      const fromEdge = x - ex;
      const vert = (y - top) / Math.max(1, bot - top);
      let k = Math.round(5 - vert * 2.6 + (rnd() - 0.5) * 0.6);
      if (fromEdge <= 0) k = 7;
      else if (fromEdge <= 1) k = 6;
      else if (fromEdge <= 3) k = Math.max(k, 5);
      else if (fromEdge === 4) k = Math.min(k, 3);
      if ((y + Math.floor(x / 3)) % 7 === 0 && fromEdge > 5) k -= 1;
      if (y - top < 1) k = Math.min(7, k + 1);
      if (bot - y < 1) k = Math.max(1, k - 2);
      set(x, y, steel[Math.max(0, Math.min(7, k))], PART.BLADE, t); // t: 0 at edge -> 1 at neck
    }
  }
  // eye block, poll, wedge, rivets, glints
  for (let y = 9; y <= 24; y++) for (let x = 27; x <= 37; x++) {
    let k = x === 27 ? 2 : x >= 36 ? 1 : 3;
    if (y === 9) k = 5; else if (y === 10) k = 4;
    if (y === 24) k = 1;
    set(x, y, steel[k], PART.EYE);
  }
  for (let y = 11; y <= 22; y++) for (let x = 38; x <= 42; x++) {
    set(x, y, steel[y === 11 ? 4 : y === 22 || x === 42 ? 1 : 2], PART.POLL);
  }
  for (let x = 30; x <= 34; x++) set(x, 8, x === 32 ? '#3d2a18' : wood[3], PART.WEDGE);
  set(32, 9, '#3d2a18', PART.WEDGE);
  for (const [x, y] of [[30, 16], [34, 16], [30, 20], [34, 20]]) { set(x, y, steel[6], PART.RIVET); set(x + 1, y + 1, steel[0], PART.RIVET); }
  for (const [x, y] of [[12, 9], [13, 9], [12, 10], [16, 13]]) set(x, y, steel[7], PART.BLADE, 0.3);

  // dark outline (keeps the pixel-art read; takes the thickness of its neighbour)
  const filled = (x, y) => x >= 0 && y >= 0 && x < S && y < S && rgba[(y * S + x) * 4 + 3] === 255;
  const out = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (filled(x, y)) continue;
    if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) out.push([x, y]);
  }
  for (const [x, y] of out) set(x, y, '#1a1c24', PART.OUTLINE);

  const canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
  canvas.getContext('2d').putImageData(new ImageData(rgba, S, S), 0, 0);
  return { canvas, rgba, parts, extra };
}
