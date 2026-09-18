# Partage de configurations et vérifications d’affichage

## Utilisation

Les dix applications proposent **Partager**, dans l’en-tête du panneau de réglages.
Le lien conserve les paramètres, options d’affichage, positions déplacées, caméra
ou cadrage, instant et état mécanique. Il s’ouvre **en pause**. Créer le lien ne
modifie pas l’expérience en cours. En cas de refus du presse-papiers, le lien reste
sélectionnable et copiable dans le champ affiché.

Les historiques nécessaires aux graphes sont inclus pour les expériences
modifiées pendant la lecture. Un avertissement apparaît pour les liens longs :
certains outils de messagerie peuvent les tronquer. Aucune approximation des
valeurs physiques n’est effectuée pour raccourcir le lien.

Un lien créé depuis un fichier local reste local ; il nécessite le même fichier
au même emplacement. Depuis GitHub Pages, après publication de ces versions,
le lien pourra être transmis aux étudiants. Aucun téléversement ni raccourcisseur
de liens n’est utilisé. Les données sont dans le fragment `#configuration=...`,
qui n’est pas envoyé au serveur HTTP.

Passer à un autre lien dans le même onglet restaure également sa configuration
en pause (y compris lors d’une navigation précédent/suivant entre ces liens).

## Architecture

- `assets/phys1985-share.js` : interface commune, codec versionné JSON/gzip,
  validation, copie et restauration transactionnelle.
- `assets/phys1985-share.css` : présentation commune, adaptée aux panneaux étroits.
- Un adaptateur explicite par application restaure le modèle et son état sans
  rejouer les événements des curseurs (qui peuvent redémarrer une expérience).
- `tools/build_apps.py` intègre ces fichiers dans les HTML autonomes et les ZIP.
  Les sources ZIP restent la référence des reconstructions suivantes.
- Une version ou une app incompatible, un lien tronqué et les paramètres
  invalides produisent un message lisible ; les données ne sont jamais exécutées.

Le niveau de zoom du navigateur et la résolution de l’écran ne sont pas imposés
par le lien. La vue physique est conservée et l’affichage reste responsive.

## Tests

Avec Node.js, Playwright et Chrome disponibles :

```sh
node tools/check_share_browser.cjs
node tools/check_share_safety.cjs
node tools/check_display_matrix.cjs
```

Chaque script accepte en premier argument un dossier alternatif contenant les
HTML autonomes. `NODE_PATH` peut désigner l’installation de Playwright.
`CHROME_PATH` permet de choisir le binaire Chrome pour les tests qui le proposent.
`APPS=cinematique_2d,cinematique_3d` restreint le test de partage.
`SCREENSHOT_DIR=/chemin/absolu` conserve les captures de la matrice d’affichage.

Le test de partage recharge chaque lien dans une nouvelle page, compare les
données et les commandes, vérifie la pause et son maintien. Il couvre toutes les
trajectoires 2D/3D, les vues et l’origine déplacées, les options inversées, les
modèles de collision, les oscillateurs amortis, les forces orientées et les
historiques de frottement/moment cinétique modifiés en lecture.

La matrice d’affichage utilise le **zoom natif de Chrome**, dans un profil
temporaire, à 100 %, 150 % et 200 %. Elle vérifie effectivement `innerWidth` et
`devicePixelRatio` ; il ne s’agit pas d’une transformation CSS. Elle contrôle les
débordements de page/panneau, les formules coupées et les erreurs MathJax, les
étiquettes en collision avant/pendant/après le contact exact, leur distance aux
sphères, et les annotations de frottement aux angles extrêmes. Les formules
explicitement défilables dans leur propre conteneur restent admises.

Les captures sont prises directement sur la surface de rendu Chrome : le
recadrage CSS automatique de Playwright produit des images tronquées au zoom
natif. Elles complètent les mesures géométriques mais ne remplacent pas une
vérification pédagogique manuelle de toutes les combinaisons possibles.

Ces tests complètent, sans les remplacer, les tests physiques et visuels déjà
présents. Les versions locales ne sont pas publiées par ces scripts.
