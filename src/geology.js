// What the stones of an island are made of. Every stone is basalt; a wild
// island (Discover) also hides veins of ore, and which ores, and how many,
// depends on its seed: copper and iron are common, obsidian likes high
// volcanic islands, gold and amethyst geodes are rare finds. A vein is a big
// ore stone with a few smaller ones around it (world.js), mined with the
// pickaxe like any stone (pickaxe.js); its pieces are the ore itself.
import { mulberry32 } from './noise.js';

const GREYS = [[0.29, 0.27, 0.31], [0.44, 0.42, 0.43], [0.53, 0.5, 0.49], [0.62, 0.58, 0.55], [0.71, 0.67, 0.62], [0.91, 0.88, 0.82]];

// hardness: blows times the basalt's; yield: share of the pieces that are
// ore (the rest is plain stone); ore: colours of the veins and flecks (a:
// dark, b: bright), how much of the stone they cover (k), the tint of the
// rock around them (base), sparkle in the sun (glint); crystal: the stone
// bristles with crystals (vegetation.js)
export const MINERALS = {
  basalt: { name: 'Basalte', label: 'Pierre', item: 'stone', hardness: 1, yield: 1, chips: GREYS },
  copper: {
    name: 'Cuivre', label: 'Filon de cuivre', item: 'ore:copper', hardness: 1.3, yield: 0.6, icon: '🟢',
    chips: [[0.16, 0.55, 0.44], [0.32, 0.78, 0.6], [0.8, 0.48, 0.24], [0.53, 0.5, 0.49]],
    ore: { a: [0.1, 0.46, 0.38], b: [0.42, 0.86, 0.64], k: 0.55, base: [0.98, 0.98, 0.96], glint: 0.25 },
  },
  iron: {
    name: 'Fer', label: 'Filon de fer', item: 'ore:iron', hardness: 1.6, yield: 0.6, icon: '🟤',
    chips: [[0.5, 0.2, 0.1], [0.72, 0.36, 0.16], [0.88, 0.55, 0.28], [0.44, 0.42, 0.43]],
    ore: { a: [0.45, 0.16, 0.08], b: [0.9, 0.5, 0.22], k: 0.6, base: [0.95, 0.86, 0.8], glint: 0.2 },
  },
  gold: {
    name: 'Or', label: 'Filon d’or', item: 'ore:gold', hardness: 1.2, yield: 0.45, icon: '🟡',
    chips: [[1, 0.86, 0.35], [0.85, 0.62, 0.15], [0.97, 0.95, 0.85], [0.62, 0.58, 0.55]],
    ore: { a: [0.78, 0.55, 0.1], b: [1, 0.9, 0.4], k: 0.42, base: [1.02, 1, 0.97], glint: 1 },
  },
  obsidian: {
    name: 'Obsidienne', label: 'Obsidienne', item: 'obsidian', hardness: 1.8, yield: 1, icon: '⚫',
    chips: [[0.1, 0.08, 0.13], [0.24, 0.2, 0.3], [0.5, 0.42, 0.62], [0.06, 0.05, 0.08]],
    ore: { a: [0.08, 0.06, 0.12], b: [0.46, 0.36, 0.62], k: 0.3, base: [0.24, 0.21, 0.29], glint: 0.7 },
  },
  amethyst: {
    name: 'Améthyste', label: 'Géode d’améthyste', item: 'amethyst', hardness: 1.4, yield: 0.75, icon: '🟣', crystal: true,
    chips: [[0.55, 0.3, 0.75], [0.8, 0.62, 0.98], [0.95, 0.9, 1], [0.53, 0.5, 0.49]],
    ore: { a: [0.42, 0.2, 0.62], b: [0.86, 0.68, 1], k: 0.3, base: [0.92, 0.9, 0.96], glint: 0.8 },
  },
};
export const ORES = ['copper', 'iron', 'gold', 'obsidian', 'amethyst'];
export const MINERAL_OF = Object.fromEntries(Object.entries(MINERALS).map(([k, m]) => [m.item, k]));
export const mineralOf = (p) => MINERALS[p.mineral || 'basalt'];

// how many veins of each ore an island holds (none for a tamed one)
export function islandGeology(cfg, landK) {
  const r = mulberry32(cfg.seed + 424242), out = {};
  const n = (a, b) => Math.max(1, Math.round((a + r() * (b - a)) * landK));
  if (r() < 0.62) out.copper = n(3, 7);
  if (r() < 0.55) out.iron = n(3, 7);
  if (r() < (cfg.relief > 0.32 ? 0.6 : 0.1)) out.obsidian = n(2, 5);
  if (r() < 0.17) out.gold = n(2, 4);
  if (r() < 0.13) out.amethyst = n(1, 3);
  if (!Object.keys(out).length) out[r() < 0.5 ? 'copper' : 'iron'] = n(3, 6); // never a barren island
  return out;
}
