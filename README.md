# Tropicool 🌴

Jeu cozy en 3D à la première personne : un archipel tropical généré procéduralement, en pixel art 3D (géométrie détaillée + textures pixel nettes). Explore, pêche, détends-toi.

**Jouer :** https://erwannn007.github.io/tropicool547745/

## Commandes
| | Tactile | Manette (DualSense, Xbox, AYN Thor) | Clavier / souris |
|---|---|---|---|
| Marcher | glisser à gauche | stick gauche (L3 / L2 : courir) | ZQSD / WASD (Maj : courir) |
| Regarder | glisser à droite | stick droit | souris |
| Sauter | ⤒ | ✕ / A | Espace |
| Pêcher / ferrer | 🎣 | □ / X, R1 ou R2 | clic / E |
| Journal | 📖 | △ / Y | — |
| Menu | ☰ | Options / Start | Échap |

Dans les menus, la manette navigue avec la croix ou le stick gauche (✕ valide, ○ ferme).

## Archipel configurable
Menu → *Archipel* : nombre d'îles, taille, relief, végétation, graine. Les réglages sont mémorisés sur l'appareil.
Options : qualité (basse/moyenne/haute), résolution, résolution dynamique, sensibilité, volume, FPS.

## Technique
- Three.js r160 (copie locale dans `vendor/`), aucun build, aucun backend : fichiers statiques pour GitHub Pages.
- Toutes les textures pixel art sont peintes procéduralement au chargement (`src/textures.js`).
- Herbe : ~100 k brins instanciés autour du joueur, échantillonnant une heightmap en half-float sur GPU.
- Végétation instanciée par cellules de 64 m (culling frustum + distance), ombres de canopée précalculées.
- PWA installable (manifest + service worker network-first).

Tester en local : `python3 -m http.server` puis ouvrir http://localhost:8000.
