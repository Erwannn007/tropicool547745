import * as THREE from 'three';
import { globals, heldLight } from './shaders.js';
import * as T from './textures.js';
import { generateWorld, DEFAULT_CONFIG } from './world.js';
import { buildTerrain } from './terrain.js';
import { buildWater } from './water.js';
import { buildSky } from './sky.js';
import { Grass } from './grass.js';
import { Vegetation, colliders as vegColliders } from './vegetation.js';
import { buildStructures } from './structures.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Fishing, SPECIES, rarityOf } from './fishing.js';
import { Audio } from './audio.js';
import { Inventory } from './inventory.js';
import { itemDef } from './items.js';
import { Axe, loadFelled } from './axe.js';
import { DayCycle, fmtHour } from './daycycle.js';
import { Lights } from './lights.js';
import { Hands } from './hands.js';
import { Mower } from './scythe.js';
import { Placement, PLACEABLE } from './placement.js';
import { initIcons } from './icons.js';
import { Book } from './book.js';

const $ = (s) => document.querySelector(s);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ---------------------------------------------------------------- settings
const SKEY = 'tropicool.settings.v1';
const defaults = {
  world: { ...DEFAULT_CONFIG },
  quality: isTouch ? 'medium' : 'high',
  res: isTouch ? 1.0 : 0.8,
  autores: true,
  sens: 1.0,
  volume: 0.6,
  showfps: false,
  hour: 9.5,
  dayspeed: 'normal',
  weather: 'auto',
};
let settings;
try { settings = { ...defaults, ...JSON.parse(localStorage.getItem(SKEY) || '{}') }; } catch (_) { settings = { ...defaults }; }
settings.world = { ...DEFAULT_CONFIG, ...settings.world };
const save = () => { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (_) { /* ignore */ } };
const params = new URLSearchParams(location.search);
if (params.has('seed')) settings.world.seed = params.get('seed').trim() || settings.world.seed;
if (params.has('hour')) settings.hour = (+params.get('hour') || 0) % 24;
if (params.has('weather')) settings.weather = params.get('weather');

// ---------------------------------------------------------------- renderer
const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // colours are authored in display space
renderer.setClearColor(0x9fd2ff);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 2500);
scene.add(camera);

let resScale = settings.res;
function resize() {
  renderer.setPixelRatio(resScale);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
initIcons(renderer);

const tex = {
  grass: T.grassTexture(), sand: T.sandTexture(), rock: T.rockTexture(), trunk: T.trunkTexture(),
  frond: T.frondTexture(), leaflet: T.leafletTexture(), fern: T.frondTexture(12, ['#174f16', '#1f661b', '#2a7f22', '#38972a', '#4cae33', '#68c440', '#8fd85a']),
  leaf: T.leafClusterTexture(), leaf2: T.leafClusterTexture(21, ['#1a5418', '#246e1e', '#2f8a26', '#3fa42f', '#55bd39', '#73d248', '#9de46a']),
  wood: T.woodTexture(), thatch: T.thatchTexture(), cushion: T.cushionTexture(), clouds: T.cloudAtlas(),
};

const audio = new Audio();
audio.setVolume(settings.volume);
const sky = buildSky(tex.clouds, 3);
scene.add(sky);
const water = buildWater();
scene.add(water);

const player = new Player(camera);
player.sound = audio;

const lights = new Lights();
const day = new DayCycle(scene, { hour: settings.hour, speed: settings.dayspeed, weather: settings.weather });
day.onShadowDir = (dir) => current?.world.setShadowDir(dir);

// ---------------------------------------------------------------- UI hooks
let toastTimer;
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}
let catchTimer;
function showCatch(f) {
  const icon = T.fishIcon(f.c, f.name.length * 31);
  const c = $('#catch-icon'); const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 32, 16); ctx.drawImage(icon, 0, 0);
  $('#catch-name').textContent = f.name;
  $('#catch-info').textContent = `${f.size} cm · ${f.rarity}`;
  $('#catch-badge').textContent = f.isNew ? '★ Nouvelle espèce !' : f.record ? '★ Record personnel !' : '';
  const card = $('#catch');
  card.classList.add('hidden'); void card.offsetWidth; card.classList.remove('hidden');
  clearTimeout(catchTimer); catchTimer = setTimeout(() => card.classList.add('hidden'), 4200);
}

const input = new Input(canvas, {
  showStick: (x, y) => { const s = $('#stick'); s.style.display = 'block'; s.style.left = x + 'px'; s.style.top = y + 'px'; $('#knob').style.transform = ''; },
  moveStick: (dx, dy) => { $('#knob').style.transform = `translate(${dx}px, ${dy}px)`; },
  hideStick: () => { $('#stick').style.display = 'none'; },
  onGamepad: (id) => { $('#pad-status').textContent = `Manette connectée : ${id.split('(')[0].trim()}`; updateHint(); },
});
input.sensitivity = settings.sens;
input.lastDevice = isTouch ? 'touch' : 'keyboard';
const lockPointer = () => { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch (_) { /* unsupported */ } };

const fishing = new Fishing(scene, camera, tex, {
  message: toast,
  caught: (f) => {
    showCatch(f);
    if (inventory.add('fish:' + f.idx, 1)) setTimeout(() => toast('Inventaire plein — poisson relâché 🌊'), 600);
  },
  bite: (on) => $('#bite').classList.toggle('on', on),
  sound: (n) => audio.sfx(n),
});

const axe = new Axe(scene, camera, tex, {
  sound: (n) => audio.sfx(n),
  rumble: (s, ms) => input.rumble(s, ms),
  drops: (list) => giveItems(list),
});
const mower = new Mower(scene);
const placement = new Placement(scene, camera, lights, {
  sound: (n) => audio.sfx(n), message: toast,
  flatten: (o, x, z, r) => mower.flatten(o, x, z, r), release: (o) => mower.release(o),
});
const hands = new Hands(lights, {
  sound: (n) => audio.sfx(n),
  mow: (x, z, fx, fz, y) => {
    const r = mower.mow(x, z, fx, fz, y);
    if (r.mowed || r.fibres) audio.sfx('mow');
    if (r.fibres) giveItems([['fibre', r.fibres]]);
  },
});
function giveItems(list) {
  const got = [];
  for (const [id, n] of list) {
    const left = inventory.add(id, n);
    if (n - left > 0) got.push(`+${n - left} ${itemDef(id).name}`);
    if (left) toast('Inventaire plein');
  }
  if (got.length) { toast(got.join(' · ')); audio.sfx('pickup'); }
}
// take a placed object back (axe blow or empty hand)
function pickPlaced() {
  const o = placement.aimed();
  if (!o) return false;
  const id = placement.pickUp(o);
  audio.sfx('place');
  giveItems([[id, 1]]);
  return true;
}
axe.hooks.hitPlaced = pickPlaced;

const ACTION_ICON = { book: '📖', rod: '🎣', axe: '🪓', scythe: '🌾', torch: '🔥', transat: '📍', parasol: '📍', campfire: '📍' };
function onHeldChange(held) {
  fishing.setEquipped(held?.id === 'rod');
  axe.setEquipped(held?.id === 'axe');
  hands.setHeld(held?.id ?? null);
  $('#btn-fish').textContent = ACTION_ICON[held?.id] || '✋';
}
const inventory = new Inventory({ sound: (n) => audio.sfx(n), toast, onChange: onHeldChange });
onHeldChange(inventory.held);
inventory.closeRequest = () => closeInventory();
$('#inv-close').addEventListener('click', () => closeInventory());

const book = new Book({ sound: (n) => audio.sfx(n), onClose: () => closeBook() });
function openBook() {
  state = 'book';
  document.exitPointerLock?.();
  book.open();
  $('#book-hint').textContent = input.lastDevice === 'gamepad' ? 'L1 / R1 : tourner les pages · ○ : fermer' : input.lastDevice === 'touch' ? 'Touche une page pour écrire' : 'Clique sur une page pour écrire · Échap : fermer';
}
function closeBook() {
  if (state !== 'book') return;
  book.close();
  state = 'play';
  if (!isTouch && input.lastDevice === 'keyboard') lockPointer();
}

function openInventory() {
  state = 'inventory';
  inventory.padFocus = input.lastDevice === 'gamepad';
  inventory.setOpen(true);
  document.exitPointerLock?.();
  audio.sfx('open');
}
function closeInventory() {
  if (state !== 'inventory') return;
  inventory.setOpen(false);
  state = 'play';
  if (!isTouch && input.lastDevice === 'keyboard') lockPointer();
}

// ---------------------------------------------------------------- world
let current = null;
function buildWorld() {
  if (current) {
    current.terrain.removeFromParent();
    current.terrain.traverse((o) => o.geometry?.dispose());
    current.terrain.userData.material.dispose();
    current.grass.dispose();
    current.veg.dispose();
    current.structures.group.removeFromParent();
    current.structures.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    current.world.texture.dispose();
  }
  const t0 = performance.now();
  const world = generateWorld(settings.world, loadFelled(settings.world));
  globals.uWorldTex.value = world.texture;
  globals.uWorldSize.value = world.size;
  const terrain = buildTerrain(world, tex, settings.quality);
  scene.add(terrain);
  const grass = new Grass(scene, settings.quality);
  const veg = new Vegetation(scene, world, tex, settings.quality);
  veg.setDistanceScale({ low: 0.6, medium: 0.8, high: 1 }[settings.quality]);
  const structures = buildStructures(world, tex);
  scene.add(structures.group);
  player.setWorld(world, [...vegColliders(world), ...structures.colliders], structures.surfaces);
  player.spawn(world.spawn);
  fishing.setWorld(world);
  axe.setWorld(world, veg, player);
  mower.setWorld(world, veg);
  placement.setWorld(world, player);
  world.setShadowDir(globals.uSunDir.value);
  day.shadowDir.copy(globals.uSunDir.value);
  current = { world, terrain, grass, veg, structures };
  window.__world = current; // handy for debugging
  window.__game = { player, camera, fishing, input, inventory, axe, day, hands, mower, placement, lights };
  console.log(`[tropicool] world ${settings.world.seed} (${world.cfg.seed}) built in ${(performance.now() - t0) | 0} ms`, {
    islands: world.islands.length, palms: world.props.palms.length, trees: world.props.trees.length,
    bushes: world.props.bushes.length, ferns: world.props.ferns.length, rocks: world.props.rocks.length,
  });
}

function regenerate() {
  $('#loading').classList.remove('hidden');
  setTimeout(() => { buildWorld(); $('#loading').classList.add('hidden'); }, 30);
}

// ---------------------------------------------------------------- menus
let state = 'start'; // start | play | menu | inventory | book
const ranges = ['islands', 'size', 'relief', 'vegetation'];
const fmt = { hour: (v) => fmtHour(+v), islands: (v) => v, size: (v) => `×${(+v).toFixed(2)}`, relief: (v) => `${Math.round(v * 100)}%`, vegetation: (v) => `${Math.round(v * 100)}%`, res: (v) => `${Math.round(v * 100)}%`, sens: (v) => (+v).toFixed(1), volume: (v) => `${Math.round(v * 100)}%` };
function syncOutputs() {
  document.querySelectorAll('output[data-for]').forEach((o) => { const id = o.dataset.for; o.textContent = fmt[id]($('#' + id).value); });
}
function fillMenu() {
  for (const k of ranges) $('#' + k).value = settings.world[k];
  $('#seed').value = settings.world.seed;
  $('#quality').value = settings.quality;
  $('#res').value = settings.res;
  $('#autores').checked = settings.autores;
  $('#sens').value = settings.sens;
  $('#volume').value = settings.volume;
  $('#showfps').checked = settings.showfps;
  $('#hour').value = day.hour.toFixed(1);
  $('#dayspeed').value = settings.dayspeed;
  $('#weather').value = settings.weather;
  syncOutputs();
}
document.querySelectorAll('#menu input, #menu select').forEach((el) => el.addEventListener('input', () => {
  syncOutputs();
  settings.sens = +$('#sens').value; input.sensitivity = settings.sens;
  settings.volume = +$('#volume').value; audio.setVolume(settings.volume);
  settings.showfps = $('#showfps').checked;
  settings.autores = $('#autores').checked;
  if (el.id === 'res') { settings.res = +$('#res').value; resScale = settings.res; resize(); }
  if (el.id === 'quality') { settings.quality = $('#quality').value; save(); regenerate(); }
  if (el.id === 'hour') { day.hour = +$('#hour').value; settings.hour = day.hour; }
  if (el.id === 'dayspeed') { settings.dayspeed = day.speed = $('#dayspeed').value; }
  if (el.id === 'weather') { settings.weather = day.weather = $('#weather').value; if (day.weather === 'auto') day.raining = false; }
  save();
}));
// random seeds read like island names
const SEED_A = ['lagon', 'corail', 'mangue', 'coco', 'récif', 'ananas', 'perle', 'tortue', 'hibiscus', 'vanille', 'cocotier', 'raie', 'goyave', 'galet', 'lune'];
const SEED_B = ['bleu', 'doré', 'turquoise', 'secret', 'paisible', 'sauvage', 'endormi', 'rose', 'lointain', 'caché', 'salé', 'tiède'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
$('#dice').onclick = () => { $('#seed').value = `${pick(SEED_A)}-${pick(SEED_B)}${Math.random() < 0.4 ? '-' + (2 + Math.floor(Math.random() * 98)) : ''}`; };
$('#seed').addEventListener('keydown', (e) => e.stopPropagation());
$('#generate').onclick = () => {
  for (const k of ranges) settings.world[k] = +$('#' + k).value;
  settings.world.seed = $('#seed').value.trim().slice(0, 32) || '1';
  save();
  regenerate();
  closeMenu();
};

function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('section[data-panel]').forEach((s) => s.classList.toggle('hidden', s.dataset.panel !== name));
  if (name === 'journal') renderJournal();
  focusIndex = 0;
}
document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => showTab(t.dataset.tab)));

function renderJournal() {
  const list = $('#journal-list'); list.innerHTML = '';
  const j = fishing.journal;
  const caught = SPECIES.filter((s) => j[s.name]).length;
  const head = document.createElement('div');
  head.className = 'meta'; head.textContent = `Espèces découvertes : ${caught} / ${SPECIES.length}`;
  list.appendChild(head);
  SPECIES.forEach((s, i) => {
    const e = j[s.name];
    const row = document.createElement('div');
    row.className = 'jrow' + (e ? '' : ' unknown');
    const c = document.createElement('canvas'); c.width = 32; c.height = 16;
    c.getContext('2d').drawImage(T.fishIcon(s.c, s.name.length * 31), 0, 0);
    const txt = document.createElement('div');
    txt.innerHTML = `<div class="name">${e ? s.name : '???'}</div><div class="meta">${e ? `×${e.count} · record ${e.best} cm · ` : ''}${rarityOf(s.w)} · ${s.d[0]}–${s.d[1]} m</div>`;
    row.append(c, txt);
    list.appendChild(row);
  });
}

function openMenu(tab = 'world') {
  state = 'menu';
  fillMenu(); showTab(tab);
  $('#menu').classList.remove('hidden');
  document.body.classList.add('menu-open');
  document.exitPointerLock?.();
  input.enabled = false;
}
function closeMenu() {
  state = 'play';
  $('#menu').classList.add('hidden');
  document.body.classList.remove('menu-open');
  input.enabled = true;
  if (!isTouch && input.lastDevice === 'keyboard') lockPointer();
}
$('#resume').onclick = closeMenu;

function startGame(withSettings) {
  audio.start();
  $('#start').classList.add('hidden');
  if (withSettings) { openMenu('world'); return; }
  state = 'play';
  input.enabled = true;
  if (!isTouch) lockPointer();
  updateHint(true);
  if (isTouch && document.documentElement.requestFullscreen && !/iPhone|iPad/.test(navigator.userAgent)) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}
$('#play').onclick = () => startGame(false);
$('#start-settings').onclick = () => startGame(true);

const tbtn = (id, fn) => $(id).addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
tbtn('#btn-fish', () => input.pressed.add('action'));
tbtn('#btn-jump', () => input.pressed.add('jump'));
tbtn('#btn-menu', () => openMenu('world'));
tbtn('#btn-inv', () => openInventory());

let hintTimer;
function updateHint(show) {
  const dev = input.lastDevice;
  document.body.classList.toggle('touch', isTouch && dev === 'touch');
  const txt = dev === 'gamepad'
    ? 'Stick G : marcher · Stick D : regarder · ✕ : sauter · □ / R2 : utiliser / poser · ◀ ▶ : tourner l’objet · L1/R1 : objet · △ : inventaire · Options : menu'
    : dev === 'touch'
      ? 'Glisse à gauche pour marcher · à droite pour regarder · bouton rond : utiliser / poser · 🎒 inventaire et fabrication'
      : 'ZQSD / WASD : marcher · Souris : regarder · Espace : sauter · Clic / F : utiliser / poser · R : tourner l’objet · 1-9 / molette : objet · E : inventaire · Échap : menu';
  $('#hint').textContent = txt;
  $('#inv-help').textContent = dev === 'gamepad'
    ? '✕ prendre / poser · □ prendre la moitié / poser 1 · R1 transfert rapide · △ / ○ fermer'
    : dev === 'touch'
      ? 'Glisse un objet pour le déplacer · Touche : prendre / poser · Appui long : moitié · Double touche : transfert rapide'
      : 'Glisser-déposer ou clic : prendre / poser · Clic droit : moitié / 1 · Maj+clic : transfert rapide · Double-clic : regrouper · 1-9 : échanger avec la barre';
  $('#controls-help').textContent = txt;
  if (show) {
    $('#hint').style.opacity = 0.92;
    clearTimeout(hintTimer); hintTimer = setTimeout(() => ($('#hint').style.opacity = 0), 9000);
  }
}

// gamepad navigation inside menus
let focusIndex = 0;
function menuNav() {
  const root = state === 'start' ? $('#start') : $('#menu');
  const els = [...root.querySelectorAll('button, input, select')].filter((e) => e.offsetParent !== null);
  if (!els.length) return;
  const p = input.pressed;
  if (p.has('up')) focusIndex = (focusIndex - 1 + els.length) % els.length;
  if (p.has('down')) focusIndex = (focusIndex + 1) % els.length;
  const el = els[Math.min(focusIndex, els.length - 1)];
  if (p.has('up') || p.has('down')) { el.focus(); el.scrollIntoView({ block: 'nearest' }); }
  if (p.has('left') || p.has('right')) {
    const dir = p.has('right') ? 1 : -1;
    if (el.type === 'range' || el.type === 'number') {
      if (el.type === 'number') el.value = Math.max(1, +el.value + dir); else (dir > 0 ? el.stepUp() : el.stepDown());
      el.dispatchEvent(new Event('input'));
    } else if (el.tagName === 'SELECT') {
      el.selectedIndex = (el.selectedIndex + dir + el.options.length) % el.options.length;
      el.dispatchEvent(new Event('input'));
    } else if (el.classList.contains('tab')) {
      const tabs = [...document.querySelectorAll('.tab')];
      const i = (tabs.indexOf(document.querySelector('.tab.active')) + dir + tabs.length) % tabs.length;
      showTab(tabs[i].dataset.tab); tabs[i].focus(); focusIndex = i;
    }
  }
  if (p.has('confirm')) {
    if (el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('input')); } else el.click();
  }
  if (p.has('back') && state === 'menu') closeMenu();
}

// ---------------------------------------------------------------- loop
// how close the lagoon is (0 inland/up high .. 1 at the waterline), for the sea sounds
let shoreTimer = 0;
function shoreness() {
  const w = current.world, { x, z, y } = camera.position;
  let wet = 0;
  for (let a = 0; a < 8; a++) {
    const cx = Math.cos(a * Math.PI / 4), sz = Math.sin(a * Math.PI / 4);
    if (w.heightAt(x + cx * 8, z + sz * 8) < 0) wet += 0.09;
    if (w.heightAt(x + cx * 22, z + sz * 22) < 0) wet += 0.035;
  }
  if (w.heightAt(x, z) < 0.2) wet += 0.3;
  return Math.min(1, wet) * Math.max(0.35, 1 - Math.max(0, y - 4) / 14);
}
// clock, placement hint, ambience levels (a few times a second)
let hudAcc = 0, lastPeriod = '', hourSave = 0;
function hudTick(dt) {
  hudAcc += dt;
  if (hudAcc < 0.25) return;
  const [, name, icon] = day.period;
  $('#clock-icon').textContent = day.rain > 0.5 ? '🌧' : icon;
  $('#clock-name').textContent = name;
  $('#clock-time').textContent = fmtHour(day.hour);
  if (name !== lastPeriod) {
    if (lastPeriod && state === 'play') { const c = $('#clock'); c.classList.remove('change'); void c.offsetWidth; c.classList.add('change'); }
    lastPeriod = name;
  }
  const t = placement.target;
  $('#place-tip').textContent = state === 'play' && t && !t.ok ? t.why : '';
  audio.setRain(day.rain * 0.9);
  audio.setNight(globals.uNight.value);
  audio.setFire(Math.max(0, 1 - placement.nearestFire() / 9) * 0.8 + (hands.id === 'torch' ? 0.25 : 0));
  if ((hourSave += hudAcc) > 10) { hourSave = 0; settings.hour = +day.hour.toFixed(2); save(); }
  hudAcc = 0;
}

const clock = new THREE.Clock();
let fpsAcc = 0, fpsFrames = 0, slowAcc = 0, fastAcc = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  globals.uTime.value += dt;

  input.update(dt);
  const prevDev = frame.dev;
  if (prevDev !== input.lastDevice) { frame.dev = input.lastDevice; updateHint(state === 'play'); }

  if (state === 'play') {
    const p = input.pressed;
    if (p.has('menu')) openMenu('world');
    else if (p.has('inventory')) openInventory();
    for (let k = 1; k <= 9; k++) if (p.has('slot' + k)) inventory.select(k - 1);
    if (p.has('next')) inventory.select(inventory.selected + 1);
    if (p.has('prev')) inventory.select(inventory.selected - 1);
    const look = input.consumeLook();
    player.update(dt, input, look);
    shoreTimer -= dt;
    if (shoreTimer < 0 && current) { shoreTimer = 0.5; audio.setShore(shoreness()); }
    const heldId = inventory.held?.id;
    if (p.has('rotate') || (input.lastDevice === 'gamepad' && (p.has('left') || p.has('right')))) placement.rotOffset += (p.has('left') ? -1 : 1) * Math.PI / 4;
    if (p.has('action')) {
      if (heldId === 'rod') fishing.action(input);
      else if (heldId === 'axe') axe.action();
      else if (heldId === 'scythe') hands.action();
      else if (heldId === 'book') openBook();
      else if (PLACEABLE[heldId]) { if (placement.place()) inventory.take(heldId, 1); }
      else if (!pickPlaced()) toast('Prends un outil dans ta barre');
    }
  } else if (state === 'book') {
    input.consumeLook();
    const p = input.pressed;
    if (p.has('back') || p.has('menu') || p.has('inventory')) closeBook();
    if (p.has('next')) book.turn(1);
    if (p.has('prev')) book.turn(-1);
    player.update(dt, { move: { x: 0, y: 0 }, pressed: new Set(), sprint: false }, { x: 0, y: 0 }, true);
  } else if (state === 'inventory') {
    input.consumeLook();
    const p = input.pressed;
    if (p.has('inventory') || p.has('back') || p.has('menu')) closeInventory();
    else {
      if (input.lastDevice === 'gamepad' && p.size && !inventory.padFocus) { inventory.padFocus = true; inventory.render(); }
      if (p.has('next')) p.add('quick');
      inventory.handlePad(p);
    }
    player.update(dt, { move: { x: 0, y: 0 }, pressed: new Set(), sprint: false }, { x: 0, y: 0 }, true);
  } else {
    input.consumeLook();
    if (state === 'menu' && input.pressed.has('menu')) closeMenu();
    else menuNav();
    if (current) player.update(dt, { move: { x: 0, y: 0 }, pressed: new Set(), sprint: false }, { x: 0, y: 0 }, true);
  }
  if (state === 'start') { player.yaw += dt * 0.04; }
  input.endFrame();

  day.update(state === 'start' ? dt * 0.3 : dt, camera, renderer);
  if (current) {
    fishing.update(dt, input);
    axe.update(dt);
    hands.update(dt, player, camera);
    mower.update(dt);
    placement.aim(state === 'play' ? inventory.held?.id : null);
    placement.update(dt);
    current.grass.update(camera);
    current.veg.update(camera);
  }
  lights.update(camera.position, globals.uTime.value);
  // fire light on the held items
  const warm = lights.at(camera.position.x, camera.position.y - 0.4, camera.position.z);
  heldLight.value.r += warm * 0.9; heldLight.value.g += warm * 0.5; heldLight.value.b += warm * 0.15;
  fishing.rod.traverse((m) => { // the rod uses plain colours: tint them by the same light
    if (!m.material) return;
    m.material.userData.base ??= m.material.color.clone();
    m.material.color.copy(m.material.userData.base).multiply(heldLight.value);
  });
  sky.userData.update(camera);
  water.position.set(Math.round(camera.position.x), 0, Math.round(camera.position.z));
  globals.uCamPos.value.copy(camera.position);
  renderer.render(scene, camera);
  if (state !== 'inventory' && state !== 'book') { axe.render(renderer, camera); hands.render(renderer, camera); }
  hudTick(dt);

  // fps + dynamic resolution
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc > 0.5) {
    const fps = fpsFrames / fpsAcc;
    $('#fps').textContent = settings.showfps ? `${fps.toFixed(0)} fps · ${Math.round(resScale * 100)}%` : '';
    if (settings.autores && state === 'play') {
      if (fps < 40) { slowAcc++; fastAcc = 0; } else if (fps > 57) { fastAcc++; slowAcc = 0; } else { slowAcc = fastAcc = 0; }
      if (slowAcc >= 3 && resScale > 0.45) { resScale = Math.max(0.45, resScale * 0.88); resize(); slowAcc = 0; }
      if (fastAcc >= 8 && resScale < settings.res) { resScale = Math.min(settings.res, resScale * 1.08); resize(); fastAcc = 0; }
    }
    fpsAcc = 0; fpsFrames = 0;
  }
}

buildWorld();
window.__booted = true;
fillMenu();
updateHint(false);
if (params.has('play')) startGame(false);
frame();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // when a new version takes over, reload once so every file matches
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded && state === 'start') { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
}
