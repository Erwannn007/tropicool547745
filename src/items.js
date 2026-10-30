// Item registry: names, stack sizes, categories, descriptions, what can be
// placed in the world and the crafting recipes.
import { SPECIES, rarityOf } from './fishing.js';

export const ITEMS = {
  rod: { name: 'Canne à pêche', max: 1, cat: 'Outil', desc: 'Lance depuis le ponton ou la plage, ferre quand ça mord.' },
  axe: { name: 'Hache', max: 1, cat: 'Outil', desc: 'Abat palmiers et arbres. Frappe un objet posé pour le reprendre.' },
  scythe: { name: 'Faux', max: 1, cat: 'Outil', desc: 'Fauche l’herbe haute et les fougères : donne des fibres.' },
  pickaxe: { name: 'Pioche', max: 1, cat: 'Outil', desc: 'Casse les pierres posées à la surface des îles : donne des pierres.' },
  book: { name: 'Carnet de voyage', max: 1, cat: 'Outil', desc: 'Utilise-le pour l’ouvrir et y écrire tes notes, tes coins de pêche, tes souvenirs.' },
  torch: { name: 'Torche tiki', max: 16, cat: 'Objet à poser', desc: 'Éclaire autour de toi. Utilise-la pour la planter dans le sol.', place: 'torch' },
  transat: { name: 'Transat', max: 4, cat: 'Objet à poser', desc: 'Chaise longue en teck et toile rayée, serviette roulée.', place: 'transat' },
  parasol: { name: 'Parasol en paille', max: 4, cat: 'Objet à poser', desc: 'Grand parasol de palmes séchées à franges.', place: 'parasol' },
  chest: { name: 'Coffre', max: 4, cat: 'Objet à poser', desc: 'Coffre en teck cerclé de laiton : 18 places pour ranger ton butin. Utilise-le pour l’ouvrir.', place: 'chest' },
  campfire: { name: 'Feu de camp', max: 8, cat: 'Objet à poser', desc: 'Cercle de pierres et bûches : chaleur et lumière la nuit.', place: 'campfire' },
  'wood:palm': { name: 'Bois de palmier', max: 64, cat: 'Matériau', desc: 'Tronçon fibreux à anneaux.' },
  'wood:tree': { name: 'Bois tropical', max: 64, cat: 'Matériau', desc: 'Bois dur et sombre des arbres de la jungle.' },
  coconut: { name: 'Noix de coco', max: 64, cat: 'Nourriture', desc: 'Son huile fait brûler les torches.' },
  stone: { name: 'Pierre', max: 64, cat: 'Matériau', desc: 'Éclat de basalte veiné de quartz, taillé à la pioche.' },
  fibre: { name: 'Fibres végétales', max: 64, cat: 'Matériau', desc: 'Herbe fauchée, tressée en botte.' },
  // building pieces (building.js): they snap onto each other
  'block:wood': { name: 'Bloc de bois', max: 64, cat: 'Construction', desc: 'Caisse en planches d’un mètre. S’empile et se colle aux autres blocs.', build: true },
  'block:stone': { name: 'Bloc de pierre', max: 64, cat: 'Construction', desc: 'Moellon de basalte taillé d’un mètre. S’empile et se colle aux autres blocs.', build: true },
  floor: { name: 'Plancher', max: 32, cat: 'Construction', desc: 'Plancher de 2 × 2 m. Monté sur pilotis si le sol est en pente ou dans l’eau.', build: true },
  wall: { name: 'Mur en rondins', max: 32, cat: 'Construction', desc: 'Mur de 2 m. Se pose au bord d’un plancher, sur un autre mur ou à côté.', build: true },
  door: { name: 'Mur avec porte', max: 32, cat: 'Construction', desc: 'Un mur en rondins avec une ouverture pour passer.', build: true },
  window: { name: 'Mur avec fenêtre', max: 32, cat: 'Construction', desc: 'Un mur en rondins percé d’une fenêtre à croisillons de bambou.', build: true },
  roof: { name: 'Toit de chaume', max: 32, cat: 'Construction', desc: 'Pan de toit qui se pose sur le haut d’un mur. Deux pans face à face font un faîte.', build: true },
  stairs: { name: 'Escalier', max: 16, cat: 'Construction', desc: 'Monte d’un étage (2 × 2 m). Se pose sur un plancher ou au bord pour y monter.', build: true },
};

// 'wood' in a recipe: any wood (palm or jungle tree), see WOOD_KINDS
export const WOOD_KINDS = ['wood:palm', 'wood:tree'];
export const RECIPES = [
  { out: 'torch', n: 2, need: [['wood', 1], ['fibre', 2], ['coconut', 1]] },
  { out: 'campfire', n: 1, need: [['wood', 3], ['stone', 4], ['fibre', 1]] },
  { out: 'transat', n: 1, need: [['wood', 3], ['fibre', 6]] },
  { out: 'parasol', n: 1, need: [['wood', 2], ['fibre', 10]] },
  { out: 'chest', n: 1, need: [['wood', 6], ['fibre', 2]] },
  { out: 'book', n: 1, need: [['fibre', 6], ['wood', 1]] },
  { out: 'block:wood', n: 4, need: [['wood', 2]] },
  { out: 'block:stone', n: 2, need: [['stone', 3]] },
  { out: 'floor', n: 1, need: [['wood', 2], ['fibre', 2]] },
  { out: 'wall', n: 1, need: [['wood', 3]] },
  { out: 'door', n: 1, need: [['wood', 3]] },
  { out: 'window', n: 1, need: [['wood', 3]] },
  { out: 'roof', n: 1, need: [['fibre', 8], ['wood', 1]] },
  { out: 'stairs', n: 1, need: [['wood', 3]] },
];

export function itemDef(id) {
  if (ITEMS[id]) return { id, ...ITEMS[id] };
  if (id === 'wood') return { id, name: 'Bois (n’importe lequel)', max: 64, cat: 'Matériau', desc: '' };
  if (id.startsWith('fish:')) {
    const s = SPECIES[+id.slice(5)];
    return { id, name: s.name, max: 64, cat: 'Poisson', desc: `${rarityOf(s.w)} · ${s.d[0]}–${s.d[1]} m de fond. Fais-le griller sur un feu de camp.`, fish: s };
  }
  if (id.startsWith('grill:')) {
    const s = SPECIES[+id.slice(6)];
    return { id, name: `${s.name} grillé`, max: 16, cat: 'Nourriture', desc: 'Peau dorée et croustillante, chair fondante. Utilise-le pour le manger.', fish: s, eat: 'good' };
  }
  if (id.startsWith('burnt:')) {
    const s = SPECIES[+id.slice(6)];
    return { id, name: `${s.name} carbonisé`, max: 16, cat: 'Nourriture', desc: 'Resté trop longtemps sur le feu… Ça se mange, mais bon.', fish: s, eat: 'burnt' };
  }
  return { id, name: id, max: 64, cat: '', desc: '' };
}

export const CAT_COLOR = { Construction: '#c8f07a', Outil: '#8fd8ff', 'Objet à poser': '#ffd34d', Matériau: '#e8c890', Nourriture: '#ffb08e', Poisson: '#7ee0dc' };
