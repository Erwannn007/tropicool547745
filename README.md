# Tropicool 🌴

Jeu cozy en 3D à la première personne : un archipel tropical généré procéduralement, en pixel art 3D (géométrie détaillée + textures pixel nettes). Explore, pêche, détends-toi.

**Jouer :** https://erwannn007.github.io/tropicool547745/

## Commandes
| | Tactile | Manette (DualSense, Xbox, AYN Thor) | Clavier / souris |
|---|---|---|---|
| Marcher | glisser à gauche | stick gauche (L3 / L2 : courir) | ZQSD / WASD (Maj : courir) |
| Regarder | glisser à droite | stick droit | souris |
| Sauter | ⤒ | ✕ / A | Espace |
| Pêcher / ferrer (canne en main) | 🎣 | □ / X ou R2 | clic / F |
| Changer d'objet | toucher la barre | L1 / R1 | 1-9 / molette |
| Inventaire | 🎒 | △ / Y | E |
| Menu | ☰ | Options / Start | Échap |

**Inventaire** (barre de 9 + 27 cases, piles de 64) : clic = prendre/poser, clic droit = moitié / poser 1, Maj+clic = transfert rapide, double-clic = regrouper, 1-9 au survol = échanger avec la barre. Tactile : toucher, appui long (moitié / 1), double touche (transfert). Manette : croix pour déplacer, ✕ prendre/poser, □ moitié, R1 transfert, △/○ fermer. Les poissons pêchés vont dans l'inventaire ; le journal reste dans le menu.

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
