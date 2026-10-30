// Inventory icons rendered from the real 3D models (models.js) into a 30x30
// target with banded lighting, then given a 1 px dark outline: the same
// objects as in the world, painted in pixels.
import * as THREE from 'three';
import { itemModel } from './models.js';
import { dress } from './dress.js';

const S = 30, OUT = 32;
const light = { value: new THREE.Color(1.06, 1.04, 1.0) };
// rotation (x, y, z) giving each item a readable three-quarter pose
// optional [3] zoom and [4] vertical aim (0 centre .. 1 top) to frame thin items
const POSE = {
  axe: [0.15, 0.5, -0.72], pickaxe: [0.15, 0.5, -0.72], stone: [0.35, 0.6, 0.1], rod: [0.1, 0.4, -0.7], scythe: [1.45, 0, -0.35, 1.05],
  boat: [0.42, -0.65, 0], torch: [0.25, 0.6, -0.62, 1.55, 0.55], transat: [0.5, -2.4, 0], parasol: [0.18, 0.4, 0], campfire: [0.55, 0.4, 0],
  book: [0.25, 0.55, -0.12], chest: [0.42, -0.55, 0], 'wood:palm': [0.45, 0.7, 0.35], 'wood:tree': [0.45, 0.7, 0.35], coconut: [0.3, 0.6, 0], fibre: [0.2, 0.5, -0.6],
  'block:wood': [0.5, 0.7, 0], 'block:stone': [0.5, 0.7, 0], floor: [0.6, 0.5, 0], wall: [0.35, 0.5, 0], door: [0.3, 0.45, 0], window: [0.3, 0.45, 0], gate: [0.15, 0.5, 0], bed: [0.5, -0.6, 0], gable: [0.2, 0.5, 0], flatroof: [0.6, 0.5, 0], roof: [0.3, 0.7, 0], stairs: [0.25, -0.75, 0],
};
let renderer = null, rt, scene, camera;
const urls = new Map();

export function initIcons(r) {
  renderer = r;
  rt = new THREE.WebGLRenderTarget(S, S, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
}

function render(id) {
  const model = itemModel(id);
  const c = document.createElement('canvas'); c.width = c.height = OUT;
  if (!model || !renderer) return c.toDataURL();
  const g = dress(model, 'icon', light);
  const pose = POSE[id] || (/^(fish|grill|burnt):/.test(id) ? [0.2, 0.35, 0.18] : [0.3, 0.6, 0]);
  g.rotation.set(pose[0], pose[1], pose[2], 'ZYX');
  scene.add(g);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const half = Math.max(size.x, size.y) * 0.5 * 1.04 / (pose[3] || 1);
  if (pose[4]) { ctr.y += (size.y * 0.5 - half) * pose[4]; ctr.x += (size.x * 0.5 - half) * pose[4]; }
  camera.left = -half; camera.right = half; camera.top = half; camera.bottom = -half;
  camera.position.set(ctr.x, ctr.y, ctr.z + 20); camera.lookAt(ctr);
  camera.updateProjectionMatrix();
  const prev = renderer.getRenderTarget(), pc = renderer.getClearColor(new THREE.Color()), pa = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(scene, camera);
  const px = new Uint8Array(S * S * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
  renderer.setRenderTarget(prev); renderer.setClearColor(pc, pa);
  scene.remove(g);

  const ctx = c.getContext('2d'), img = ctx.createImageData(OUT, OUT);
  const a = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : px[((S - 1 - y) * S + x) * 4 + 3]);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    const sx = x - 1, sy = y - 1, o = (y * OUT + x) * 4;
    if (a(sx, sy) > 127) {
      const i = ((S - 1 - sy) * S + sx) * 4;
      img.data.set([px[i], px[i + 1], px[i + 2], 255], o);
    } else if (a(sx - 1, sy) > 127 || a(sx + 1, sy) > 127 || a(sx, sy - 1) > 127 || a(sx, sy + 1) > 127) {
      img.data.set([38, 24, 34, 235], o); // warm dark outline
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

export function iconURL(id) {
  if (!urls.has(id)) urls.set(id, render(id));
  return urls.get(id);
}
