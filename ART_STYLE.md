# Charte graphique de Tropicool

Version visuelle complète (palettes, captures, frise d'animation) : https://claude.ai/artifact/XgWHgZpmxmy9fsHYqBMetA

**Principe : modelé en 3D, peint en pixels.** Chaque objet est une vraie forme 3D, habillée de textures pixel art, et s'affiche en gros pixels nets. La hache (`src/axeModel.js`) est l'étalon : tout nouvel élément doit tenir la comparaison à côté d'elle.

## Les six règles
1. **Forme** : volumes modelés (courbes, biseaux, effilements). Ni voxels ni gros cubes, ni assemblage de primitives nues.
2. **Pixel** : le détail est peint dans de petites textures, filtrées en `NearestFilter` (`NearestMipmapLinearFilter` au loin). Jamais de filtrage bilinéaire ni d'anticrénelage.
3. **Rendu** : les objets tenus en main sont rendus dans une cible d'environ 220 lignes, agrandie en `Nearest`.
4. **Couleur** : chaque matière a une rampe de 4 à 8 teintes. Ombres plus froides et saturées, lumières plus chaudes. Ni gris pur ni noir pur.
5. **Lumière** : soleil chaud en haut à gauche (`sunDir` dans `src/shaders.js`), ombre en aplats de 3 à 4 niveaux sur les objets proches, ombres de feuillage peintes au sol, reflets nets sur le métal. Aucun contour noir en 3D (seulement sur les icônes 16×16).
6. **Détail** : chaque objet a un détail signature visible de près (anneaux, nervures, fil du tranchant, nœuds).

## Densité de pixels
| Usage | Densité |
|---|---|
| Sol (herbe, sable, roche) | 16 px/m |
| Arbres, rochers, constructions | 16 à 32 px/m |
| Foliole de palmier | 8 × 32 px |
| Objet tenu en main | ≈ 220 lignes à l'écran |
| Icône d'inventaire | 16 × 16 px, contour sombre |
| Nuage | ≈ 2 m/px |

## Rampes (extraits)
- Herbe : `#2f8a1c #3d9f22 #4cb328 #5bc42e #6bd234 #7edd3c #95e84a #aef25e`
- Sable : `#c9ad78 #d8be8a #e4cc98 #ecd7a6 #f3e2b6 #f8ecc8`
- Lagon : `#8feddb #29ccd1 #147fc7 #0d4ca3`
- Manche doré : `#a8701e #c48a28 #d9a234 #e8b444 #f4c95e`
- Acier : `#525e78 #66738c #808fa6 #b8c4d9 #f5faff`
- Tronc : `#5a3a1e #6e4a27 #86603a #9d7448 #b28856 #c49a66`
- Palme jeune : `#2f8a22 #47a82e #63c23a #86d84c #b4ec72` · sèche : `#7a5a22 #9a7a32 #b8964a #d2b262 #e8d088`

## Mouvement
Anticipation, temps mort, geste rapide, impact marqué (arrêt d'environ 70 ms, secousse, particules carrées), retour en douceur. Référence : le coup de hache (0 → 0,16 → 0,20 → impact 0,255 → 0,29 → 0,36 → 0,62 s).

## Avant d'ajouter un élément
- [ ] Forme modelée, pas une boîte ni un cube
- [ ] Texture à la bonne densité, lisible en `Nearest`
- [ ] Couleurs tirées d'une rampe (ou nouvelle rampe ajoutée ici)
- [ ] Beau de profil, de dessus et de dessous (pas de carte plate visible)
- [ ] Un détail signature
- [ ] Tient la comparaison à côté de la hache

## À remettre en conformité
Canne à pêche et bouchon, buissons et arbres (cartes de feuilles plates), fougères (bandes plates), toit de la paillote (pyramide à 4 faces).
