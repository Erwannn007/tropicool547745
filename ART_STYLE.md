# Charte graphique de Tropicool

Cette charte est **obligatoire** pour tout élément visuel ajouté ou modifié (modèle, texture, effet, animation, icône), que le travail soit fait par une personne ou une IA. Version visuelle avec captures (privée, accessible au propriétaire) : https://claude.ai/artifact/XgWHgZpmxmy9fsHYqBMetA

## La référence, décrite
Les images de référence du projet sont des captures de jeux indé pixel-art 3D (non incluses dans le dépôt). Ce qu'il faut en retenir :
- un monde 3D lisse et lumineux, ciel bleu intense, gros cumulus blancs, eau turquoise transparente, herbe vert lime très dense ;
- des objets **modelés** (pas de voxels), recouverts de **textures pixel art** nettes ;
- l'objet tenu en main est **affiché en gros pixels** (basse résolution agrandie sans lissage) : long manche doré épais depuis le coin bas-droite, petite tête d'acier clair au tranchant blanc ;
- ombrage en **aplats** (quelques niveaux), couleurs saturées et chaudes, aucun contour noir.

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

## Recettes techniques (réutiliser, ne pas réinventer)
Three.js r160, sans build. Les couleurs sont écrites directement en espace d'affichage : textures en `THREE.NoColorSpace`, sortie du renderer en `LinearSRGBColorSpace`, donc pas de conversion sRGB à prévoir.

- **Peindre une texture pixel art** : classe `Pix` dans `src/textures.js` (`set(x, y, rgb)`, puis `.texture()` qui règle `Nearest` + mipmaps). Une texture = une fonction `xxxTexture(seed)` avec sa rampe en tête de fonction. Pour une texture locale, voir `pixTex()` dans `src/axeModel.js`.
- **Matériau du monde** : `makeMaterial()` dans `src/shaders.js` injecte les uniformes globaux (soleil, brouillard, `worldData()` pour la hauteur et l'ombre au sol) et `lightDiffuse()`. Les végétaux utilisent `foliageMaterial()` (`src/vegetation.js`) : vent, translucidité, ombre peinte, mode `ROCK`.
- **Géométrie modelée** : la classe `Builder` (`src/vegetation.js`) produit position, normale, uv et `aSway` (amplitude du vent). Exemples à suivre : `ringTrunk()` (tronc à anneaux fermés), `leafletFrond()` (feuille en vraie géométrie), `headGeometry()` / `handleGeometry()` (`src/axeModel.js`, profil extrudé chanfreiné et effilé). Orientation des triangles : sens antihoraire vu de l'extérieur.
- **Objet tenu en main** : copier le schéma de `AxeModel` : scène dédiée, `bandedMaterial()` (ombre en 4 niveaux et reflet net), rendu dans une cible basse résolution (`size.y / 220`) puis quad agrandi en `Nearest`, poses en images-clés avec `basis(direction du manche, direction de la lame)`.
- **Feuillage proche** : vraie géométrie jusqu'à ~75 m, version légère au-delà (champ `lod: 'near' | 'far'` dans `Vegetation`). Jamais de carte plate visible de près.
- **Particules** : `THREE.Points` en carrés (voir `burst()` dans `src/axe.js`), couleurs tirées des rampes.
- **Vérifier** : capture d'écran du jeu sous plusieurs angles (profil, dessus, dessous) avant de livrer ; un élément qui ressemble à une image plate quand on tourne autour n'est pas conforme.
