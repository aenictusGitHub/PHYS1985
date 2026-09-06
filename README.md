# PHYS1985 — Animations interactives de mécanique

Voici quelques animations interactives pour le cours PHYS1985 - Physique générale I (partie Concepts).

## Ouvrir les animations

- [Cinématique 2D](https://aenictusgithub.github.io/PHYS1985/cinematique_2d_webapp_fr.html)
- [Cinématique 3D](https://aenictusgithub.github.io/PHYS1985/cinematique_3d_webapp_fr.html)
- [Travail et puissance](https://aenictusgithub.github.io/PHYS1985/puissance_travail_webapp_fr.html)
- [Énergie mécanique](https://aenictusgithub.github.io/PHYS1985/energie_mecanique_webapp_fr.html)
- [Énergie potentielle et force](https://aenictusgithub.github.io/PHYS1985/potentiel_force_webapp_fr.html)

## QR codes

| Cinématique 2D | Cinématique 3D | Travail et puissance | Énergie mécanique |
| --- | --- | --- | --- |
| [![QR code vers l’animation 2D](qr-codes/cinematique_2d.png)](https://aenictusgithub.github.io/PHYS1985/cinematique_2d_webapp_fr.html) | [![QR code vers l’animation 3D](qr-codes/cinematique_3d.png)](https://aenictusgithub.github.io/PHYS1985/cinematique_3d_webapp_fr.html) | [![QR code vers l’animation Travail et puissance](qr-codes/puissance_travail.png)](https://aenictusgithub.github.io/PHYS1985/puissance_travail_webapp_fr.html) | [![QR code vers l’animation Énergie mécanique](qr-codes/energie_mecanique.png)](https://aenictusgithub.github.io/PHYS1985/energie_mecanique_webapp_fr.html) |

Énergie mécanique : [QR code PNG](qr-codes/energie_mecanique.png) · [QR code SVG](qr-codes/energie_mecanique.svg).

### Énergie potentielle et force

[![QR code vers Énergie potentielle et force](qr-codes/potentiel_force.png)](https://aenictusgithub.github.io/PHYS1985/potentiel_force_webapp_fr.html)

[QR code PNG](qr-codes/potentiel_force.png) · [QR code SVG](qr-codes/potentiel_force.svg).

## Fichiers

- `cinematique_2d_webapp_fr.html` et `cinematique_3d_webapp_fr.html` : versions autonomes prêtes à ouvrir ;
- `cinematique_2d_webapp_fr.zip` et `cinematique_3d_webapp_fr.zip` : archives contenant les sources séparées ;
- `puissance_travail_webapp_fr.html` : animation autonome sur le travail et la puissance ;
- `puissance_travail_webapp_fr.zip` : archive contenant ses sources séparées ;
- `energie_mecanique_webapp_fr.html` et `energie_mecanique_webapp_fr.zip` : animation autonome sur l’énergie et archive de ses sources ;
- `potentiel_force_webapp_fr.html` et `potentiel_force_webapp_fr.zip` : animation autonome reliant potentiel et force, et archive de ses sources ;
- `index.html` : page d’accueil publiée avec GitHub Pages ;
- `qr-codes/` : QR codes en PNG et SVG.

Les applications intègrent MathJax. Sa licence est conservée dans `LICENSES/MathJax-LICENSE.txt`.

## Présentation commune

Les cinq applications et l’accueil partagent le thème `assets/phys1985-theme.css` : mêmes tailles de texte, de formules et de valeurs numériques, mêmes commandes et même palette scientifique. Le thème est intégré dans chaque HTML autonome et inclus dans chaque archive source; aucune connexion n’est nécessaire pour ouvrir les animations.

Pour reconstruire les cinq applications à partir de leurs archives sources après une modification du thème :

```sh
python3 tools/build_apps.py
```

Pour reconstruire aussi depuis un dossier source modifié, ajouter `--source nom_application=/chemin/du/dossier` (le nom est le nom du fichier HTML sans extension). Les calculs physiques sont conservés lors de l’harmonisation graphique.

L’option `--app nom_application` limite la reconstruction à une application; elle peut être répétée. Les calculs d’à-coup des deux archives sources sont vérifiables avec `python3 tools/check_jerk.py` (Node.js ou JavaScript système de macOS).

## Énergie mécanique

Cette nouvelle application s’inspire des échanges d’énergie présentés dans les vidéos `oscillations_harmoniques.mp4` et `Energie_pendule_double.mp4`. Les dessins et calculs sont réalisés dans l’application ; les vidéos ne sont pas redistribuées.

- Oscillateur : solution analytique, masse, raideur, position et vitesse initiales réglables ; parabole du potentiel et segment représentant l’énergie cinétique.
- Pendule simple : équation complète aux grands angles, masse, longueur, angle et vitesse angulaire initiaux et pesanteur réglables ; petites et grandes oscillations, rotations complètes, hauteur et angle affichés. Tige idéale rigide sans masse, potentiel nul au point le plus bas.
- Pendule double : masses, longueurs, angles, vitesses angulaires initiales et pesanteur réglables ; tiges idéales sans masse. Chaque potentiel est référencé à la hauteur minimale accessible à sa masse.
- Deux corps gravitationnels : attraction newtonienne mutuelle, centre de masse fixe, masses, séparation et vitesse relative initiales réglables ; orbites circulaires, elliptiques, masses inégales et échappement. Potentiel de la paire négatif et nul à l’infini ; affichage signé des énergies avec facteurs d’échelle explicites. Ce système est isolé, sans frottement.
- Option « Avec frottements » pour les trois systèmes : force visqueuse proportionnelle à la vitesse, amortissement réglable, énergie dissipée en gris et vérification du bilan entre énergie mécanique restante et énergie transférée au milieu.
- Diagramme de répartition, énergies empilées ou courbes séparées, détail par masse, lecture/pause, vitesse de lecture, durée et choix de l’instant par curseur, graphique ou clavier.
- Position initiale réglable en faisant glisser les masses avant « Lire », à la souris ou au toucher, ou avec les touches fléchées sur une masse sélectionnée. Les longueurs des tiges et les réglages de vitesse sont conservés ; pour la gravitation, la séparation et l’orientation s’ajustent autour du centre de masse fixe, en conservant le rapport à la vitesse circulaire. Paramètres et énergies se mettent à jour pendant le geste. « Recommencer » permet de les repositionner après la lecture.
- Calcul des pendules, des deux corps gravitationnels et de l’oscillateur amorti par Runge–Kutta avec contrôle adaptatif du pas et correction de Richardson, sans renormaliser l’énergie. L’énergie dissipée est intégrée indépendamment. L’écart numérique réel du bilan énergétique est affiché, arrondi à zéro sous la résolution d’affichage.

Tests analytiques, références orbitales de Kepler, énergie et moment cinétique, contraintes des tiges, équilibre et navigation temporelle : `python3 tools/check_energy.py`. La variable optionnelle `PHYS1985_NODE` permet de spécifier le chemin de Node.js.

Tests unitaires des commandes (avec un adaptateur DOM/canvas minimal, sans navigateur) : `node tools/check_energy_ui.cjs`.

## Énergie potentielle et force

Cette application s’inspire de `Potential Energy Force.mp4`, sans redistribuer la vidéo.
Deux exemples : un double puits asymétrique original, puis une paire de particules
avec un [potentiel de Lennard–Jones](https://docs.lammps.org/pair_lj.html) non tronqué.
Les échelles choisies sont pédagogiques, pas celles d’un atome particulier.

- Courbes du potentiel et de la composante de force avec le même axe horizontal.
- Point de lecture et tangente déplaçables, choix direct des équilibres stables ou instables.
- Vecteurs de longueur proportionnelle au module des forces, avec une échelle de référence ; forces égales et opposées sur les deux corps.
- Échelles d’énergie et de longueur réglables ; valeurs et unités LaTeX avec décimales à point.
- Exploration par curseur, souris, toucher ou clavier. Le balayage automatique explore les positions ; ce n’est pas une simulation de mouvement.

Vérifications des dérivées analytiques, équilibres, commandes, flèches et balayage :
`node tools/check_potential.cjs`. La variable optionnelle `PHYS1985_MATHJAX_ROOT`
permet aussi de vérifier les formules avec une installation de mathjax-full.

## Sauvegarde avant harmonisation

La [sauvegarde datée du 5 septembre 2026](backups/PHYS1985-avant-harmonisation-2026-09-05.zip) contient toutes les anciennes versions HTML et sources ainsi que les QR codes. Voir les [instructions de restauration](backups/README.md).
