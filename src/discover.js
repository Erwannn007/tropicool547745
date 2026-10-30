// Discover mode: islands found one at a time, each with a truly random seed
// (words, letters, digits, all mixed) and random generator settings (one
// small islet or a big archipelago), kept in a registry: number, name (a
// default one, renamable), seed, settings, when it was found, where you last
// stood. Every island is a world instance of its own (saves.js): trees
// felled, builds, chests, boats... stay under its id.
const KEY = 'tropicool.isles.v1';

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (_) { return []; } };
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { /* private mode */ } };

export const listIsles = () => read();
export const findIsle = (id) => read().find((i) => i.id === id) || null;
export function writeIsle(entry) {
  const list = read(), i = list.findIndex((e) => e.id === entry.id);
  if (i >= 0) list[i] = { ...list[i], ...entry }; else list.unshift(entry);
  write(list);
}
export function deleteIsle(id) { write(read().filter((e) => e.id !== id)); }

// ---- randomness from the device's generator, not Math.random
const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const chars = (set, n) => Array.from({ length: n }, () => pick(set)).join('');
const UP = 'ABCDEFGHJKLMNPQRSTUVWXYZ', LOW = 'abcdefghijkmnopqrstuvwxyz', DIG = '0123456789';
const WORDS = ['lagon', 'corail', 'mangue', 'coco', 'récif', 'ananas', 'perle', 'tortue', 'hibiscus', 'vanille', 'raie', 'goyave', 'galet', 'lune',
  'soleil', 'alizé', 'embrun', 'nacre', 'conque', 'mérou', 'papaye', 'cannelle', 'ylang', 'orchidée', 'atoll', 'écume', 'sable', 'dauphin',
  'manta', 'frangipane', 'bambou', 'mousson', 'passe', 'baie', 'crique', 'gecko', 'colibri', 'litchi', 'tiaré', 'pirogue', 'banian', 'aloha'];
// many shapes of seed, so the registry reads like a real explorer's log
const SHAPES = [
  () => `${chars(UP + DIG, 4)}-${chars(UP + DIG, 4)}`, // K7Q2-9XMF
  () => `${pick(WORDS)}-${int(2, 9999)}`, // corail-482
  () => `${pick(WORDS)}${pick(WORDS)}${int(1, 99)}`, // perlelune7
  () => chars(UP + LOW + DIG, int(5, 8)), // Vx9tQ2b
  () => String(int(10000, 999999999)), // 58210394
  () => `${pick(WORDS)}-${chars(UP, int(2, 3))}`, // mangue-QZ
  () => `${chars(LOW, 3)}${int(10, 999)}${chars(UP, 2)}`, // kpe372XA
  () => `${pick(WORDS)}.${chars(LOW + DIG, 4)}`, // récif.8b3k
  () => `${pick(WORDS)}-${pick(WORDS)}-${chars(DIG + UP, 3)}`, // nacre-baie-4F7
];
export function randomSeed(taken = new Set()) {
  let s;
  do s = pick(SHAPES)().slice(0, 32); while (taken.has(s));
  return s;
}

// generator settings within the ranges of the Archipel sliders (steps of 0.05)
const step = (x) => Math.round(x / 0.05) * 0.05;
export function randomIsleCfg() {
  const r = rnd(), islands = r < 0.18 ? 1 : r < 0.32 ? 2 : r < 0.48 ? 3 : r < 0.64 ? 4 : r < 0.78 ? 5 : r < 0.88 ? 6 : r < 0.94 ? 7 : r < 0.97 ? 8 : r < 0.99 ? 9 : 10;
  return {
    islands,
    size: +step(0.55 + Math.pow(rnd(), 1.3) * 1.05).toFixed(2),
    relief: +step(0.05 + rnd() * 0.9).toFixed(2),
    vegetation: +step(0.35 + rnd() * 0.65).toFixed(2),
    stones: +step(0.15 + rnd() * 0.75).toFixed(2),
  };
}

// a name for the log: the kind of land, then what it is "of"
const OF = ['de la Tortue', 'des Perles', 'du Corail', 'aux Mangues', 'de l’Alizé', 'des Embruns', 'de Nacre', 'des Conques', 'aux Hibiscus',
  'de la Lune', 'du Soleil levant', 'des Raies', 'de la Vanille', 'des Dauphins', 'aux Colibris', 'des Mantas', 'du Gecko', 'de l’Écume',
  'des Frangipaniers', 'de la Mousson', 'aux Cocotiers', 'des Lagons', 'du Banian', 'de l’Orchidée', 'des Pirogues', 'du Mérou', 'aux Papayes',
  'du Tiaré', 'des Sables blancs', 'de la Baie cachée', 'du Vent doux', 'des Marées', 'aux Coquillages', 'du Grand Récif', 'de Cannelle'];
export function isleName(cfg, taken = new Set()) {
  const kind = cfg.islands === 1 ? (cfg.size < 0.8 ? 'Îlot' : cfg.relief > 0.7 ? 'Mont' : 'Île')
    : cfg.islands === 2 ? 'Îles jumelles' : cfg.islands <= 4 ? 'Îles' : 'Archipel';
  // a complement no island of the registry wears yet, while there are some left
  const free = OF.filter((o) => ![...taken].some((n) => n.includes(o)));
  const base = `${kind} ${pick(free.length ? free : OF)}`;
  let name = base;
  for (let k = 2; taken.has(name); k++) name = `${base} ${['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][k - 2] ?? k}`;
  return name;
}
