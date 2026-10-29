# Tropicool 🌴

Jeu cozy en 3D à la première personne : un archipel tropical généré procéduralement, en pixel art 3D (géométrie détaillée + textures pixel nettes). Explore, pêche, coupe du bois, fauche, fabrique et installe ton coin de plage, de l’aube à la nuit.

**Jouer :** https://erwannn007.github.io/tropicool547745/

## Commandes
| | Tactile | Manette (DualSense, Xbox, AYN Thor) | Clavier / souris |
|---|---|---|---|
| Marcher | glisser à gauche | stick gauche (L3 / L2 : courir) | ZQSD / WASD (Maj : courir) |
| Regarder | glisser à droite | stick droit | souris |
| Sauter | ⤒ | ✕ / A | Espace |
| Utiliser / poser l’objet | bouton rond | □ / X ou R2 | clic / F |
| Tourner l’objet à poser | — | croix ◀ ▶ | R |
| Changer d'objet | toucher la barre | L1 / R1 | 1-9 / molette |
| Inventaire | 🎒 | △ / Y | E |
| Menu | ☰ | Options / Start | Échap |

**Inventaire** (barre de 9 + 27 cases, piles de 64) : clic = prendre/poser, clic droit = moitié / poser 1, Maj+clic = transfert rapide, double-clic = regrouper, 1-9 au survol = échanger avec la barre. Tactile : toucher, appui long (moitié / 1), double touche (transfert). Manette : croix pour déplacer, ✕ prendre/poser, □ moitié, R1 transfert, △/○ fermer. Les poissons pêchés vont dans l'inventaire ; la **hache** abat palmiers (4 coups → bois de palmier + noix de coco) et arbres (5 coups → bois tropical) en creusant de vraies entailles dans le tronc ; ils repoussent au bout de 20 minutes. La **faux** fauche l’herbe haute et les fougères (→ fibres végétales), l’herbe repousse en 10 minutes. Le journal reste dans le menu.

**Fabrication** (panneau à droite de l’inventaire) : torche tiki, feu de camp, transat, parasol en paille, carnet de voyage, à partir de bois, fibres et noix de coco.

**Coffre** : pose-le puis utilise-le pour l’ouvrir (18 places, couvercle qui s’ouvre) ; Maj+clic / double touche / R1 envoie un objet d’un côté à l’autre. Un coffre plein ne se reprend pas.

**Carnet de voyage** : utilise-le pour l’ouvrir et écrire librement (40 pages, sauvegardées sur l’appareil ; L1 / R1 tournent les pages à la manette).

**Objets à poser** : en main, un hologramme bleu montre où l’objet sera posé (rouge si impossible : eau, pente, obstacle, trop loin). La torche éclaire aussi quand on la tient. Un coup de hache (ou la main vide) reprend un objet posé. Les objets posés sont mémorisés par archipel.

**Temps et météo** : cycle aube, matin, midi, après-midi, soir, nuit (24 min par jour, nuits plus courtes), soleil et lune qui se reflètent dans le lagon, étoiles, ombres qui tournent avec le soleil, averses (gouttes, ronds dans l’eau, sol mouillé, orage lointain).

Dans les menus, la manette navigue avec la croix ou le stick gauche (✕ valide, ○ ferme).

## Archipel configurable
Menu → *Archipel* : nombre d'îles, taille, relief, végétation, graine (lettres, mots ou chiffres : `lagon-turquoise`, 🎲 en propose une). Les réglages sont mémorisés sur l'appareil.
Options : qualité (basse/moyenne/haute), résolution, résolution dynamique, sensibilité, volume, FPS, heure, vitesse du cycle jour/nuit (normal, lent, figé), météo (variable, toujours beau, pluie).
**Mondes** (menu → *Mondes*) : enregistre le monde où tu joues sous un nom (arbres coupés, herbe fauchée, objets posés, coffres, position, heure) et reviens-y quand tu veux ; un monde enregistré se sauvegarde ensuite tout seul. Taper une graine et générer donne toujours l’archipel vierge (un monde non enregistré est alors oublié).
URL : `?seed=…`, `?hour=21`, `?weather=rain`.

## Technique
- Three.js r160 (copie locale dans `vendor/`), aucun build, aucun backend : fichiers statiques pour GitHub Pages.
- Toutes les textures pixel art sont peintes procéduralement au chargement (`src/textures.js`).
- Herbe : ~100 k brins instanciés autour du joueur, échantillonnant une heightmap en half-float sur GPU.
- Végétation instanciée par cellules de 64 m (culling frustum + distance), ombres de canopée précalculées.
- PWA installable (manifest + service worker network-first).

Tester en local : `python3 -m http.server` puis ouvrir http://localhost:8000.
