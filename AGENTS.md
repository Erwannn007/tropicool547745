# Instructions pour les agents IA

Tropicool est un jeu cozy en 3D à la première personne (archipel tropical procédural, exploration, pêche, hache, faux, pioche, fabrication, objets à poser, cycle jour/nuit et météo), en **pixel art 3D**, jouable sur iPhone, Android, AYN Thor et PC, avec commandes tactiles, manette (DualSense…) et clavier/souris. Hébergé sur GitHub Pages, sans backend.

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
- `src/world.js` : génération de l'archipel (hauteurs, herbe, roche, ombres peintes, accessoires, ponton, paillote). Les gros rochers sont des amas de pierres minables de toutes tailles (`world.clusters`, `restingY()` : une pierre posée sur une autre se tasse quand celle du dessous est cassée, `Quarry.settleCluster()`).
- `src/shaders.js` : uniformes globaux + GLSL commun (`makeMaterial`, `worldData`, `lightDiffuse`, `pointLights`, `lightAt`, brouillard). Tout matériau du monde doit utiliser `lightAt()` (soleil/lune + torches) et `uShade` pour les ombres peintes.
- `src/daycycle.js` : heure du jour et météo ; anime soleil, lune, ciel, brouillard, nuages, ombres peintes (re-peintes quand le soleil tourne), pluie.
- `src/lights.js` : lumières ponctuelles (torches, feux), les 8 plus proches envoyées aux shaders.
- `src/textures.js` : toutes les textures pixel art procédurales.
- `src/terrain.js`, `src/water.js`, `src/sky.js`, `src/grass.js` : sol, lagon, ciel et nuages, herbe instanciée.
- `src/splash.js` : vie de la surface du lagon : ondes en anneaux (liste `uRip` lue par le shader de `water.js`), gouttes carrées, sillage quand on marche ou nage dans l'eau, éclaboussure quand un objet ou le joueur tombe dedans. Le bois et les noix de coco flottent, les pierres coulent (`debris.js`).
- `src/vegetation.js` : palmiers, arbres, buissons, fougères, rochers, pierres à miner (géométrie + instancing par cellules de 64 m ; `detailStone()` donne le matériau à fissures d'une pierre qu'on mine). Rochers, pierres et éclats sont des blocs taillés en plaques (`cutBlock()` + `platePlanes()`), joints clairs d'un pixel dessinés par le define `PLATES`.
- `src/structures.js` : ponton, paillote (sol et bois vernis avec reflets `varnish()` de `shaders.js`, canapés à coussins arrondis).
- `src/player.js`, `src/input.js` : déplacement, collisions ; clavier/souris, tactile, manette.
- `src/items.js` : registre des objets (nom, pile, catégorie, description, objet à poser) et recettes.
- `src/inventory.js` : inventaire 9 + 27 cases + fabrication, panneaux pixel assortis aux menus.
- `src/models.js` : modèles 3D des objets (torche tiki, transat, parasol, feu de camp, faux, bûches, noix de coco, fibres, canne, poissons) ; `src/dress.js` : leurs matériaux (monde, main, icône, hologramme, flamme).
- `src/icons.js` : icônes d'inventaire rendues depuis les modèles 3D (30 px + contour).
- `src/held.js` : objet tenu générique (même recette que la hache ; pivot autour de la main, inertie au regard, vibration d'impact) ; `src/hands.js` : faux, pioche (tenue comme la hache, coup visé sur ce que montre le viseur), torche, objets à poser, tout autre objet qui a un modèle (noix de coco, bois, pierre, fibres, chaque poisson qui frétille) affiché en main devant à droite (`itemView()`) ; pas de main visible ; l'outil est rangé pendant qu'on porte un morceau.
- `src/placement.js` : aperçu bleu/rouge, règles de pose, collisions, lumières, braises, sauvegarde par archipel.
- `src/saves.js` : mondes enregistrés ; chaque monde joué a un id d'instance (`settings.world.instance`) sous lequel sont rangés arbres abattus, herbe fauchée et objets posés (`worldKey()` dans `src/axe.js`).
- `src/book.js` : carnet de voyage (pages à écrire, sauvegarde locale).
- `src/pickaxe.js` : minage des pierres de surface. `Quarry.cast()` lance un rayon contre les vrais maillages (pierres, rochers), troncs, sol et morceaux ; le coup part là où la pointe de la pioche touche réellement (balayage de la pointe dans `hands.js`), creuse un éclat et ouvre des fissures autour du point frappé (`uHits` du matériau à fissures), puis la pierre éclate en morceaux physiques. Tables `MINERALS` (dureté) et `TOOLS` (puissance). Rien ne va dans l'inventaire automatiquement. Densité : réglage « Pierres » du générateur (`cfg.stones`, flux aléatoire à part).
- `src/debris.js` : objets physiques posés dans le monde (éclats de pierre, bûches et noix de coco des arbres abattus, `spawnItem()` pour tout modèle de `models.js`) : petit solide rigide (contacts sur les points de l'enveloppe, rebonds, frottement, troncs, pierres, lagon), sommeil quand immobile, plafond de 36 morceaux ; le morceau tenu reste un objet du monde (`hold()` : un peu à droite du viseur, suit avec un léger retard, bute contre sol, troncs, pierres et paillote avec un bruit selon la matière) ; visée, saisie, lâcher, lancer et rangement dans le sac (actions séparées : G / clic droit, clic, V ; ○, □, R3 ; boutons ✋ ⤓ ➶ 🎒 en tactile). A (touche `KeyQ`, le A d'un clavier AZERTY ; ▼ à la manette ; ⤓ en tactile) dépose un exemplaire de l'objet tenu dans le monde (`dropItem()`, gardé, jamais effacé) ; V sur un objet visé au sol le range directement.
- `src/scythe.js` : fauchage (carte d'herbe coupée lue par `grass.js`, repousse, fougères, fibres).
- `src/fishing.js`, `src/axe.js`, `src/axeModel.js` : pêche ; hache (abattage, entailles creusées dans la géométrie du tronc via `Vegetation.detailTrunk`) et son modèle tenu en main.
- `src/blow.js` : coup au contact partagé par la pioche et la hache (pose de frappe visée sur le viseur, balayage de la pointe ou du tranchant contre `Quarry.cast()`, arrêt net et rebond sur ce qui est touché, sinon le geste continue). Ce que l'outil ne casse pas (rocher, sol, paillote et ponton `kind: 'build'`, pierre pour la hache) le renvoie avec le retour de `Quarry.hit()`.
- `sw.js`, `manifest.webmanifest` : PWA (service worker « réseau d'abord »).
