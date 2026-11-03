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
  bed: { name: 'Lit de l’île', max: 2, cat: 'Objet à poser', desc: 'Cadre en bambou, natte de palme tressée et moustiquaire. Utilise-le pour dormir et faire passer le temps.', place: 'bed' },
  boat: { name: 'Barque', max: 1, cat: 'Objet à poser', desc: 'Barque à clins peinte et ses deux rames. Mets-la à l’eau, monte dedans et rame d’île en île. Saute pour descendre.' },
  campfire: { name: 'Feu de camp', max: 8, cat: 'Objet à poser', desc: 'Cercle de pierres et bûches : chaleur et lumière la nuit.', place: 'campfire' },
  'wood:palm': { name: 'Bois de palmier', max: 64, cat: 'Matériau', desc: 'Tronçon fibreux à anneaux.' },
  'wood:tree': { name: 'Bois tropical', max: 64, cat: 'Matériau', desc: 'Bois dur et sombre des arbres de la jungle.' },
  coconut: { name: 'Noix de coco', max: 64, cat: 'Nourriture', desc: 'Son huile fait brûler les torches.' },
  stone: { name: 'Pierre', max: 64, cat: 'Matériau', desc: 'Éclat de basalte veiné de quartz, taillé à la pioche.' },
  fibre: { name: 'Fibres végétales', max: 64, cat: 'Matériau', desc: 'Herbe fauchée, tressée en botte.' },
  // ores (geology.js), mined from the veins of wild islands or found in chests
  'ore:copper': { name: 'Minerai de cuivre', max: 64, cat: 'Minerai', desc: 'Roche veinée de malachite verte et de cuivre natif.' },
  'ore:iron': { name: 'Minerai de fer', max: 64, cat: 'Minerai', desc: 'Lourd, couleur de rouille. Dur à la pioche.' },
  'ore:gold': { name: 'Pépite d’or', max: 64, cat: 'Minerai', desc: 'Rare et brillante. Les filons d’or ne se trouvent que sur quelques îles.' },
  obsidian: { name: 'Obsidienne', max: 64, cat: 'Minerai', desc: 'Verre volcanique noir aux reflets violets. Aime les îles montagneuses.' },
  amethyst: { name: 'Améthyste', max: 64, cat: 'Minerai', desc: 'Cristaux violets tirés d’une géode. Ils luisent un peu la nuit.' },
  compass: { name: 'Boussole', max: 1, cat: 'Outil', desc: 'Tiens-la en main : elle t’indique le lieu inexploré le plus proche de l’île.' },
  lantern: { name: 'Lanterne de cristal', max: 8, cat: 'Objet à poser', desc: 'Une améthyste qui brille dans une cage de fer. Lumière douce et violette.', place: 'lantern' },
  // building pieces (building.js): they snap onto each other
  'block:wood': { name: 'Bloc de bois', max: 64, cat: 'Construction', desc: 'Caisse en planches d’un mètre. S’empile et se colle aux autres blocs.', build: true },
  'block:stone': { name: 'Bloc de pierre', max: 64, cat: 'Construction', desc: 'Moellon de basalte taillé d’un mètre. S’empile et se colle aux autres blocs.', build: true },
  floor: { name: 'Plancher', max: 32, cat: 'Construction', desc: 'Plancher de 2 × 2 m. Monté sur pilotis si le sol est en pente ou dans l’eau.', build: true },
  wall: { name: 'Mur en rondins', max: 32, cat: 'Construction', desc: 'Mur de 2 m. Se pose au bord d’un plancher, sur un autre mur ou à côté.', build: true },
  door: { name: 'Mur avec porte', max: 32, cat: 'Construction', desc: 'Un mur en rondins avec une ouverture pour passer.', build: true },
  window: { name: 'Mur avec fenêtre', max: 32, cat: 'Construction', desc: 'Un mur en rondins percé d’une fenêtre à croisillons de bambou.', build: true },
  gate: { name: 'Porte en bambou', max: 16, cat: 'Construction', desc: 'Se pose dans un mur avec porte. Utilise-la pour l’ouvrir ou la fermer.', build: true },
  gable: { name: 'Pignon', max: 32, cat: 'Construction', desc: 'Ferme le haut d’un mur sous un toit : triangle sous la pente (il se tourne tout seul), panneau plein sous le bord haut.', build: true },
  flatroof: { name: 'Toit plat', max: 32, cat: 'Construction', desc: 'Natte de chaume épaisse posée à plat sur le haut des murs. On peut marcher dessus.', build: true },
  gablewall: { name: 'Pignon', max: 32, cat: 'Construction', desc: 'Ferme le haut d’un mur sous le bord haut d’un toit.', build: true },
  roofcorner: { name: 'Angle de toit', max: 32, cat: 'Construction', desc: 'Deux pans de toit qui tournent l’angle.', build: true },
  roof: { name: 'Toit de chaume', max: 32, cat: 'Construction', desc: 'Pan de toit qui se pose sur le haut d’un mur. Deux pans face à face font un faîte ; deux pans en équerre font un angle tout seuls.', build: true },
  'block:obsidian': { name: 'Bloc d’obsidienne', max: 64, cat: 'Construction', desc: 'Dalle de verre volcanique poli. S’empile et se colle aux autres blocs.', build: true },
  'block:gold': { name: 'Bloc d’or', max: 64, cat: 'Construction', desc: 'Lingots empilés. Pour un trône, un phare, ou juste pour briller.', build: true },
  'block:copper': { name: 'Bloc de cuivre', max: 64, cat: 'Construction', desc: 'Plaques rivetées, verdies par l’air marin. S’empile et se colle aux autres blocs.', build: true },
  // metalwork (forge.js): the furnace melts ore into ingots, the anvil forges the better tools
  furnace: { name: 'Four', max: 4, cat: 'Objet à poser', desc: 'Four en pierres et argile. Utilise-le pour l’ouvrir : minerai en haut, combustible en bas, il fond le minerai en lingots, fait du charbon avec le bois et grille le poisson.', place: 'furnace' },
  anvil: { name: 'Enclume', max: 2, cat: 'Objet à poser', desc: 'Enclume de fer sur un billot. Les outils en fer, en obsidienne et la canne dorée se forgent quand tu es à côté.', place: 'anvil' },
  'ingot:copper': { name: 'Lingot de cuivre', max: 64, cat: 'Matériau', desc: 'Cuivre fondu au four. Pour les outils en cuivre, les lanternes et les blocs de cuivre.' },
  'ingot:iron': { name: 'Lingot de fer', max: 64, cat: 'Matériau', desc: 'Fer fondu au four. Pour l’enclume, les outils en fer et en obsidienne.' },
  'ingot:gold': { name: 'Lingot d’or', max: 64, cat: 'Matériau', desc: 'Or fondu au four. Pour la canne dorée, la statue et les blocs d’or.' },
  charcoal: { name: 'Charbon de bois', max: 64, cat: 'Matériau', desc: 'Bois cuit au four. Le meilleur combustible : il brûle quatre fois plus longtemps que le bois.' },
  'axe:copper': { name: 'Hache en cuivre', max: 1, cat: 'Outil', desc: 'Lame de cuivre rouge. Un coup de moins pour abattre un arbre.', tier: 1 },
  'axe:iron': { name: 'Hache en fer', max: 1, cat: 'Outil', desc: 'Fer forgé à l’enclume. Abat un palmier en deux coups.', tier: 2 },
  'axe:obsidian': { name: 'Hache d’obsidienne', max: 1, cat: 'Outil', desc: 'Tranchant de verre volcanique, plus fin qu’un rasoir. Un palmier tombe d’un seul coup.', tier: 3 },
  'pickaxe:copper': { name: 'Pioche en cuivre', max: 1, cat: 'Outil', desc: 'Casse les pierres plus vite et entame le fer et les géodes d’améthyste.', tier: 1 },
  'pickaxe:iron': { name: 'Pioche en fer', max: 1, cat: 'Outil', desc: 'Forgée à l’enclume. Assez dure pour l’or et l’obsidienne.', tier: 2 },
  'pickaxe:obsidian': { name: 'Pioche d’obsidienne', max: 1, cat: 'Outil', desc: 'La plus tranchante : fend n’importe quel filon en quelques coups.', tier: 3 },
  'rod:gold': { name: 'Canne dorée', max: 1, cat: 'Outil', desc: 'Moulinet et anneaux en or : ça mord deux fois plus vite et les poissons rares viennent plus souvent.', tier: 1 },
  'lantern:copper': { name: 'Lanterne en cuivre', max: 8, cat: 'Objet à poser', desc: 'Lanterne de marin en cuivre, une flamme chaude derrière ses vitres.', place: 'lantern:copper' },
  statue: { name: 'Statue d’or', max: 2, cat: 'Objet à poser', desc: 'Idole tiki coulée dans l’or, yeux d’améthyste. Elle brille au soleil comme sous la lune.', place: 'statue' },
  pearl: { name: 'Perle', max: 64, cat: 'Matériau', desc: 'Une perle ronde et nacrée, prise dans un bénitier géant au fond du lagon. Le bénitier en refait une avec le temps.' },
  'block:nacre': { name: 'Bloc de nacre', max: 64, cat: 'Construction', desc: 'Dalles de nacre irisée, roses et vertes à la lumière. S’empile et se colle aux autres blocs.', build: true },
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
  { out: 'bed', n: 1, need: [['wood', 5], ['fibre', 12]] },
  { out: 'boat', n: 1, need: [['wood', 10], ['fibre', 6]] },
  { out: 'book', n: 1, need: [['fibre', 6], ['wood', 1]] },
  { out: 'block:wood', n: 4, need: [['wood', 2]] },
  { out: 'block:stone', n: 2, need: [['stone', 3]] },
  { out: 'floor', n: 1, need: [['wood', 2], ['fibre', 2]] },
  { out: 'wall', n: 1, need: [['wood', 3]] },
  { out: 'door', n: 1, need: [['wood', 3]] },
  { out: 'window', n: 1, need: [['wood', 3]] },
  { out: 'gate', n: 1, need: [['wood', 2], ['fibre', 2]] },
  { out: 'roof', n: 1, need: [['fibre', 8], ['wood', 1]] },
  { out: 'gable', n: 1, need: [['wood', 2]] },
  { out: 'flatroof', n: 1, need: [['fibre', 8], ['wood', 1]] },
  { out: 'stairs', n: 1, need: [['wood', 3]] },
  // metalwork: furnace first, then copper tools in the bag, then the anvil
  // for everything forged in iron, obsidian or gold (at: 'anvil')
  { out: 'furnace', n: 1, need: [['stone', 8], ['fibre', 2]] },
  { out: 'axe:copper', n: 1, need: [['ingot:copper', 3], ['wood', 2]] },
  { out: 'pickaxe:copper', n: 1, need: [['ingot:copper', 3], ['wood', 2]] },
  { out: 'anvil', n: 1, need: [['ingot:iron', 4], ['stone', 3], ['wood', 2]] },
  { out: 'axe:iron', n: 1, need: [['ingot:iron', 3], ['wood', 2]], at: 'anvil' },
  { out: 'pickaxe:iron', n: 1, need: [['ingot:iron', 3], ['wood', 2]], at: 'anvil' },
  { out: 'axe:obsidian', n: 1, need: [['obsidian', 3], ['ingot:iron', 1], ['ingot:gold', 1], ['wood', 2]], at: 'anvil' },
  { out: 'pickaxe:obsidian', n: 1, need: [['obsidian', 3], ['ingot:iron', 1], ['ingot:gold', 1], ['wood', 2]], at: 'anvil' },
  { out: 'rod:gold', n: 1, need: [['ingot:gold', 3], ['fibre', 4], ['wood', 1]], at: 'anvil' },
  { out: 'compass', n: 1, need: [['ingot:iron', 1], ['ingot:copper', 1], ['wood', 1]] },
  { out: 'lantern', n: 2, need: [['amethyst', 1], ['ingot:iron', 1]] },
  { out: 'lantern:copper', n: 2, need: [['ingot:copper', 2], ['coconut', 1]] },
  { out: 'statue', n: 1, need: [['ingot:gold', 6], ['amethyst', 2]], at: 'anvil' },
  { out: 'block:copper', n: 2, need: [['ingot:copper', 3]] },
  { out: 'block:obsidian', n: 2, need: [['obsidian', 3]] },
  { out: 'block:gold', n: 1, need: [['ingot:gold', 4]] },
  { out: 'block:nacre', n: 4, need: [['pearl', 1], ['stone', 4]] },
];
// workstations a recipe may need nearby
export const STATIONS = { anvil: 'Enclume' };

// Tool families: 'axe', 'axe:copper', 'axe:iron'… are all axes. The base
// tool is tier 0; better ones cut and mine faster (axe.js, pickaxe.js) and
// the pickaxe tier decides which ores it can break (geology.js).
export const TIER_NAME = ['de base', 'en cuivre', 'en fer', 'd’obsidienne'];
export const toolKind = (id) => (id && /^(axe|pickaxe|rod)(:|$)/.test(id) ? id.split(':')[0] : id);
export const toolTier = (id) => ITEMS[id]?.tier ?? 0;
export const toolMetal = (id) => (id?.includes(':') && toolKind(id) !== id ? id.split(':')[1] : null); // 'copper' | 'iron' | 'obsidian' | 'gold' | null

export function itemDef(id) {
  if (ITEMS[id]) return { id, ...ITEMS[id] };
  if (id === 'wood') return { id, name: 'Bois (n’importe lequel)', max: 64, cat: 'Matériau', desc: '' };
  if (id === 'crab') return { id, name: 'Crabe cru', max: 16, cat: 'Poisson', desc: 'Attrapé sur la plage. Fais-le griller sur un feu de camp.' };
  if (id === 'grill:crab') return { id, name: 'Crabe grillé', max: 16, cat: 'Nourriture', desc: 'Carapace rouge vif, chair tendre et sucrée. Utilise-le pour le manger.', eat: 'good' };
  if (id === 'burnt:crab') return { id, name: 'Crabe carbonisé', max: 16, cat: 'Nourriture', desc: 'Oublié sur le feu… Ça croque un peu trop.', eat: 'burnt' };
  if (id === 'turtle') return { id, name: 'Tortue crue', max: 4, cat: 'Poisson', desc: 'Prise sur la plage. Fais-la griller sur un feu de camp.' };
  if (id === 'grill:turtle') return { id, name: 'Tortue grillée', max: 4, cat: 'Nourriture', desc: 'Rôtie dans sa carapace, chair fondante. Utilise-la pour la manger.', eat: 'good' };
  if (id === 'burnt:turtle') return { id, name: 'Tortue carbonisée', max: 4, cat: 'Nourriture', desc: 'Restée trop longtemps sur le feu… Il ne reste que du charbon.', eat: 'burnt' };
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

export const CAT_COLOR = { Construction: '#c8f07a', Outil: '#8fd8ff', 'Objet à poser': '#ffd34d', Matériau: '#e8c890', Minerai: '#d8a8ff', Nourriture: '#ffb08e', Poisson: '#7ee0dc' };
