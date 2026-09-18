# Tablettes : pincement et protection des manipulations

## Comportement

- En cinématique 2D et 3D, deux doigts zooment/déplacent la scène. Les gestionnaires spécifiques restent inchangés.
- Dans les huit autres apps, deux doigts agrandissent la page, y compris sur les courbes, surfaces, poignées et graphiques temporels.
- Un seul doigt continue à déplacer les objets, tourner une surface ou choisir un instant.
- Si un deuxième doigt arrive après le début d’une manipulation, son déplacement provisoire est annulé. Les paramètres, positions, caméra et historiques sont restaurés à l’état du premier contact ; une animation initialement en lecture reprend. Lever un doigt ne réactive pas une manipulation au milieu du pincement.
- Un défilement vertical pris en charge par le navigateur annule également une sélection provisoire sur un graphique.
- Les curseurs natifs restent des commandes du navigateur : leur pincement ne doit pas modifier de paramètre, mais le navigateur peut absorber le geste sans agrandir. Commencer sur le graphique ou une zone de texte permet le zoom de page.
- Les cibles des commandes sur écran tactile mesurent au moins 44 px ; les menus gardent leur fonctionnement natif et leur accès clavier.

## Implémentation

`assets/phys1985-touch.js` installe une protection en capture, avant les gestionnaires des apps. Seuls les gestes tactiles sont concernés ; souris, clavier et stylet continuent à suivre les gestionnaires existants. Un instantané local `PhysShare` est pris uniquement au début d’un geste sur une surface modifiable ou un curseur, sans créer de lien ni transmettre de données. Il est restauré si le geste devient multi-doigts ou si le navigateur annule les événements pour défiler.

Les `pointercancel` natifs peuvent arriver avant que les doigts quittent l’écran : les événements `touchend/touchcancel` servent donc à conserver le verrou jusqu’au dernier doigt. Les captures de pointeur sont libérées, les clics synthétisés après pincement sont ignorés et la valeur DOM d’un curseur est protégée contre les événements natifs retardés.

`assets/phys1985-touch.css` autorise `pinch-zoom` sur les anciennes surfaces restrictives tout en conservant leurs règles à un doigt. Le rendu des menus WebKit est harmonisé ; l’agrandissement des cibles utilise `any-pointer: coarse`, y compris sur les appareils hybrides. `tools/build_apps.py` incorpore les deux fichiers aux HTML autonomes et aux ZIP sources.

## Tests

Avec Playwright et les navigateurs disponibles :

```sh
node tools/check_tablet_touch_browser.cjs
node tools/check_tablet_playback.cjs
node tools/check_tablet_layout.cjs
node tools/check_2d_touch_browser.cjs
node tools/check_3d_touch_browser.cjs
node tools/check_display_matrix.cjs
node tools/check_share_browser.cjs
```

Ces scripts acceptent un dossier alternatif de HTML autonomes en premier argument. Le test tactile accepte `APPS=...`, `RESULT_DIR=...` et `MOBILE=0` pour le mode ordinateur tactile. La matrice d’affichage accepte `ENGINES=chromium,webkit,firefox` et `RESULT_DIR=...`. `PLAYWRIGHT_BROWSERS_PATH` permet d’utiliser des navigateurs de test sans modifier les profils personnels.

La matrice couvre quatre formats (600 × 960, 768 × 1024, 1024 × 1366, 1180 × 820), les modèles, les commandes simples et les zones tactiles. Les essais multi-doigts Chrome vérifient séparément le zoom natif ou celui de la scène, l’invariance mécanique, les poignées et curseurs, le déplacement provisoire avant le second doigt, le relâchement partiel et la manipulation suivante. Un test distinct vérifie trois doigts et la reprise de la lecture. Les suites existantes contrôlent aussi le zoom navigateur natif à 150/200 % et les configurations partagées.

Ces tests ne certifient pas tous les matériels ni toutes les anciennes versions de système. WebKit de test n’est pas un iPad physique ; la recette finale reste à effectuer sur iPad/Safari, Android/Chrome ou Samsung Internet et Windows/Edge tactile. Aucun test ne publie automatiquement les apps.

### Validation du 18 septembre 2026

- 1 056 configurations d’affichage : aucun échec, sur Chromium, WebKit et Firefox, avec des cibles de commandes d’au moins 44 px.
- 80 essais de pincement sur les dix apps, complétés par huit cas distincts sur les forces et les poignées des poulies : aucun échec.
- 30 essais complémentaires en mode ordinateur tactile : aucun échec.
- Huit essais de reprise de lecture, de geste à trois doigts et de manipulation suivante : aucun échec.
- Suites existantes de cinématique 2D/3D, 404 vérifications d’affichage avec zoom navigateur et 83 partages de configuration : réussies.
- Les calculs physiques et les gestionnaires propres à chaque app restent inchangés. Les corrections concernent la couche tactile commune et la présentation des commandes.
