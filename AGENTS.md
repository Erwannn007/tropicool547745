# Instructions pour les agents IA

Tropicool est un jeu cozy en 3D à la première personne (archipel tropical procédural, exploration, pêche, hache, faux, fabrication, objets à poser, cycle jour/nuit et météo), en **pixel art 3D**, jouable sur iPhone, Android, AYN Thor et PC, avec commandes tactiles, manette (DualSense…) et clavier/souris. Hébergé sur GitHub Pages, sans backend.

## Style visuel : lire `ART_STYLE.md` avant tout travail visuel
`ART_STYLE.md` est la charte graphique obligatoire. Résumé : **formes 3D modelées, détail peint dans des textures pixel art filtrées en `Nearest`, rendu en gros pixels nets, couleurs en rampes saturées, soleil chaud en haut à gauche, ombre en aplats, aucun contour noir en 3D, un détail signature par objet.** Interdits : voxels / gros cubes, low-poly à facettes plates, textures floues, cartes plates qui se voient comme des images. La hache (`src/axeModel.js`) est l'étalon de qualité.

## Règles du projet
- **Aucun build** : modules ES servis tels quels, Three.js r160 copié dans `vendor/`. Pas de dépendance npm côté jeu.
- **Avant chaque push** qui touche `src/`, `style.css` ou `index.html` : lancer `python3 tools/bump_version.py`. Sinon les téléphones gardent des modules en cache mélangés et le jeu ne démarre plus.
- **Textes en français.** Dans les chaînes JS entre apostrophes droites, utiliser l'apostrophe typographique `’` (une `'` dans `'…l'objet…'` casse le script).
- **Mobile d'abord** : penser au coût sur téléphone (instancing, LOD, culling par cellules), tester aussi en format paysage 844×390 tactile.
- **Tester réellement** avant de livrer : servir avec `python3 -m http.server`, ouvrir `/?play`, vérifier la console (aucune erreur) et faire des captures (Playwright ou navigateur). `window.__game` et `window.__world` exposent l'état pour les tests.

## Carte du code
- `src/main.js` : démarrage, boucle, menus, réglages, branchement des modules.
- `src/world.js` : génération de l'archipel (hauteurs, herbe, roche, ombres peintes, accessoires, ponton, paillote).
- `src/shaders.js` : uniformes globaux + GLSL commun (`makeMaterial`, `worldData`, `lightDiffuse`, `pointLights`, `lightAt`, brouillard). Tout matériau du monde doit utiliser `lightAt()` (soleil/lune + torches) et `uShade` pour les ombres peintes.
- `src/daycycle.js` : heure du jour et météo ; anime soleil, lune, ciel, brouillard, nuages, ombres peintes (re-peintes quand le soleil tourne), pluie.
- `src/lights.js` : lumières ponctuelles (torches, feux), les 8 plus proches envoyées aux shaders.
- `src/textures.js` : toutes les textures pixel art procédurales.
- `src/terrain.js`, `src/water.js`, `src/sky.js`, `src/grass.js` : sol, lagon, ciel et nuages, herbe instanciée.
- `src/vegetation.js` : palmiers, arbres, buissons, fougères, rochers (géométrie + instancing par cellules de 64 m).
- `src/structures.js` : ponton, paillote.
- `src/player.js`, `src/input.js` : déplacement, collisions ; clavier/souris, tactile, manette.
- `src/items.js` : registre des objets (nom, pile, catégorie, description, objet à poser) et recettes.
- `src/inventory.js` : inventaire 9 + 27 cases + fabrication, panneaux pixel assortis aux menus.
- `src/models.js` : modèles 3D des objets (torche tiki, transat, parasol, feu de camp, faux, bûches, noix de coco, fibres, canne, poissons) ; `src/dress.js` : leurs matériaux (monde, main, icône, hologramme, flamme).
- `src/icons.js` : icônes d'inventaire rendues depuis les modèles 3D (30 px + contour).
- `src/held.js` : objet tenu générique (même recette que la hache) ; `src/hands.js` : faux, torche et objets à poser en main.
- `src/placement.js` : aperçu bleu/rouge, règles de pose, collisions, lumières, braises, sauvegarde par archipel.
- `src/scythe.js` : fauchage (carte d'herbe coupée lue par `grass.js`, repousse, fougères, fibres).
- `src/fishing.js`, `src/axe.js`, `src/axeModel.js` : pêche ; hache (abattage, entailles creusées dans la géométrie du tronc via `Vegetation.detailTrunk`) et son modèle tenu en main.
- `sw.js`, `manifest.webmanifest` : PWA (service worker « réseau d'abord »).
