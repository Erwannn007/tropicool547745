# Instructions pour les agents IA

Tropicool est un jeu cozy en 3D à la première personne (archipel tropical procédural, exploration, pêche, hache, inventaire), en **pixel art 3D**, jouable sur iPhone, Android, AYN Thor et PC, avec commandes tactiles, manette (DualSense…) et clavier/souris. Hébergé sur GitHub Pages, sans backend.

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
- `src/shaders.js` : uniformes globaux + GLSL commun (`makeMaterial`, `worldData`, `lightDiffuse`, brouillard).
- `src/textures.js` : toutes les textures pixel art procédurales.
- `src/terrain.js`, `src/water.js`, `src/sky.js`, `src/grass.js` : sol, lagon, ciel et nuages, herbe instanciée.
- `src/vegetation.js` : palmiers, arbres, buissons, fougères, rochers (géométrie + instancing par cellules de 64 m).
- `src/structures.js` : ponton, paillote.
- `src/player.js`, `src/input.js` : déplacement, collisions ; clavier/souris, tactile, manette.
- `src/inventory.js` : inventaire 9 + 27 cases, style « liquid glass ».
- `src/fishing.js`, `src/axe.js`, `src/axeModel.js` : pêche ; hache (abattage, entailles) et son modèle tenu en main.
- `sw.js`, `manifest.webmanifest` : PWA (service worker « réseau d'abord »).
