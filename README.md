# PHYS1985 — Animations interactives de mécanique

Voici quatre animations interactives pour le cours PHYS1985 - Physique générale I (partie Concepts).
Les symboles, valeurs et unités mathématiques sont composés en LaTeX avec MathJax.
Les deux animations de cinématique proposent aussi l’à-coup : un vecteur sélectionnable, sa norme et ses composantes en mètres par seconde cube.

## Ouvrir les animations

- [Cinématique 2D](https://aenictusgithub.github.io/PHYS1985/cinematique_2d_webapp_fr.html)
- [Cinématique 3D](https://aenictusgithub.github.io/PHYS1985/cinematique_3d_webapp_fr.html)
- [Travail et puissance](https://aenictusgithub.github.io/PHYS1985/puissance_travail_webapp_fr.html)
- [Énergie mécanique](https://aenictusgithub.github.io/PHYS1985/energie_mecanique_webapp_fr.html) : oscillateur harmonique et pendule double.

## QR codes

| Cinématique 2D | Cinématique 3D | Travail et puissance |
| --- | --- | --- |
| [![QR code vers l’animation 2D](qr-codes/cinematique_2d.png)](https://aenictusgithub.github.io/PHYS1985/cinematique_2d_webapp_fr.html) | [![QR code vers l’animation 3D](qr-codes/cinematique_3d.png)](https://aenictusgithub.github.io/PHYS1985/cinematique_3d_webapp_fr.html) | [![QR code vers l’animation Travail et puissance](qr-codes/puissance_travail.png)](https://aenictusgithub.github.io/PHYS1985/puissance_travail_webapp_fr.html) |

Énergie mécanique : [QR code PNG](qr-codes/energie_mecanique.png) · [QR code SVG](qr-codes/energie_mecanique.svg).

## Fichiers

- `cinematique_2d_webapp_fr.html` et `cinematique_3d_webapp_fr.html` : versions autonomes prêtes à ouvrir ;
- `cinematique_2d_webapp_fr.zip` et `cinematique_3d_webapp_fr.zip` : archives contenant les sources séparées ;
- `puissance_travail_webapp_fr.html` : animation autonome sur le travail et la puissance ;
- `puissance_travail_webapp_fr.zip` : archive contenant ses sources séparées ;
- `energie_mecanique_webapp_fr.html` et `energie_mecanique_webapp_fr.zip` : animation autonome sur l’énergie et archive de ses sources ;
- `index.html` : page d’accueil publiée avec GitHub Pages ;
- `qr-codes/` : QR codes en PNG et SVG.

Les applications intègrent MathJax. Sa licence est conservée dans `LICENSES/MathJax-LICENSE.txt`.

## Présentation commune

Les quatre applications et l’accueil partagent le thème `assets/phys1985-theme.css` : mêmes tailles de texte, de formules et de valeurs numériques, mêmes commandes et même palette scientifique. Le thème est intégré dans chaque HTML autonome et inclus dans chaque archive source; aucune connexion n’est nécessaire pour ouvrir les animations.

Pour reconstruire les quatre applications à partir de leurs archives sources après une modification du thème :

```sh
python3 tools/build_apps.py
```

Pour reconstruire aussi depuis un dossier source modifié, ajouter `--source nom_application=/chemin/du/dossier` (le nom est le nom du fichier HTML sans extension). Les calculs physiques sont conservés lors de l’harmonisation graphique.

L’option `--app nom_application` limite la reconstruction à une application; elle peut être répétée. Les calculs d’à-coup des deux archives sources sont vérifiables avec `python3 tools/check_jerk.py` (Node.js ou JavaScript système de macOS).

## Énergie mécanique

Cette nouvelle application s’inspire des échanges d’énergie présentés dans les vidéos `oscillations_harmoniques.mp4` et `Energie_pendule_double.mp4`. Les dessins et calculs sont réalisés dans l’application ; les vidéos ne sont pas redistribuées.

- Oscillateur : solution analytique, masse, raideur, position et vitesse initiales réglables ; parabole du potentiel et segment représentant l’énergie cinétique.
- Pendule double : masses, longueurs, angles, vitesses angulaires initiales et pesanteur réglables ; tiges idéales sans masse et sans frottement. Chaque potentiel est référencé à la hauteur minimale accessible à sa masse.
- Diagramme de répartition, énergies empilées ou courbes séparées, détail par masse, lecture/pause, vitesse de lecture, durée et choix de l’instant par curseur, graphique ou clavier.
- Calcul du pendule par Runge–Kutta avec contrôle adaptatif du pas et correction de Richardson, sans renormaliser l’énergie. L’écart numérique réel est affiché, arrondi à zéro sous la résolution d’affichage.

Tests analytiques, conservation, contraintes des tiges, équilibre et navigation temporelle : `python3 tools/check_energy.py`. La variable optionnelle `PHYS1985_NODE` permet de spécifier le chemin de Node.js.

Tests unitaires des commandes (avec un adaptateur DOM/canvas minimal, sans navigateur) : `node tools/check_energy_ui.cjs`.

## Sauvegarde avant harmonisation

La [sauvegarde datée du 5 septembre 2026](backups/PHYS1985-avant-harmonisation-2026-09-05.zip) contient toutes les anciennes versions HTML et sources ainsi que les QR codes. Voir les [instructions de restauration](backups/README.md).
