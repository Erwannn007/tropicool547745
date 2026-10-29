// Item registry: names, stack sizes, categories, descriptions, what can be
// placed in the world and the crafting recipes.
import { SPECIES, rarityOf } from './fishing.js';

export const ITEMS = {
  rod: { name: 'Canne à pêche', max: 1, cat: 'Outil', desc: 'Lance depuis le ponton ou la plage, ferre quand ça mord.' },
  axe: { name: 'Hache', max: 1, cat: 'Outil', desc: 'Abat palmiers et arbres. Frappe un objet posé pour le reprendre.' },
  scythe: { name: 'Faux', max: 1, cat: 'Outil', desc: 'Fauche l’herbe haute et les fougères : donne des fibres.' },
  torch: { name: 'Torche tiki', max: 16, cat: 'Objet à poser', desc: 'Éclaire autour de toi. Utilise-la pour la planter dans le sol.', place: 'torch' },
  transat: { name: 'Transat', max: 4, cat: 'Objet à poser', desc: 'Chaise longue en teck et toile rayée, serviette roulée.', place: 'transat' },
  parasol: { name: 'Parasol en paille', max: 4, cat: 'Objet à poser', desc: 'Grand parasol de palmes séchées à franges.', place: 'parasol' },
  campfire: { name: 'Feu de camp', max: 8, cat: 'Objet à poser', desc: 'Cercle de pierres et bûches : chaleur et lumière la nuit.', place: 'campfire' },
  'wood:palm': { name: 'Bois de palmier', max: 64, cat: 'Matériau', desc: 'Tronçon fibreux à anneaux.' },
  'wood:tree': { name: 'Bois tropical', max: 64, cat: 'Matériau', desc: 'Bois dur et sombre des arbres de la jungle.' },
  coconut: { name: 'Noix de coco', max: 64, cat: 'Nourriture', desc: 'Son huile fait brûler les torches.' },
  fibre: { name: 'Fibres végétales', max: 64, cat: 'Matériau', desc: 'Herbe fauchée, tressée en botte.' },
};

export const RECIPES = [
  { out: 'torch', n: 2, need: [['wood:palm', 1], ['fibre', 2], ['coconut', 1]] },
  { out: 'campfire', n: 1, need: [['wood:tree', 2], ['wood:palm', 2], ['fibre', 1]] },
  { out: 'transat', n: 1, need: [['wood:tree', 3], ['fibre', 6]] },
  { out: 'parasol', n: 1, need: [['wood:palm', 2], ['fibre', 10]] },
];

export function itemDef(id) {
  if (ITEMS[id]) return { id, ...ITEMS[id] };
  if (id.startsWith('fish:')) {
    const s = SPECIES[+id.slice(5)];
    return { id, name: s.name, max: 64, cat: 'Poisson', desc: `${rarityOf(s.w)} · ${s.d[0]}–${s.d[1]} m de fond`, fish: s };
  }
  return { id, name: id, max: 64, cat: '', desc: '' };
}

export const CAT_COLOR = { Outil: '#8fd8ff', 'Objet à poser': '#ffd34d', Matériau: '#e8c890', Nourriture: '#ffb08e', Poisson: '#7ee0dc' };
