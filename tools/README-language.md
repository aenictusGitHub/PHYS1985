# Français / English

Les dix apps proposent un menu **Langue** dans leur en-tête. Le français reste
la langue par défaut. La préférence est conservée localement dans le navigateur,
sans requête réseau. `?lang=fr` ou `?lang=en` a priorité sur cette préférence ;
le lien **Partager** conserve aussi la langue.

Changer de langue capture la configuration existante (paramètres, options, vue,
instant et historiques), puis recharge l'app **en pause**. Les liens de
configuration antérieurs restent valables. Le sélecteur de langue ne fait pas
partie des commandes physiques sauvegardées.

## Maintenance

- `assets/phys1985-en.json` : catalogue français → anglais, commun aux dix apps.
- `assets/phys1985-language.js` : sélection, traduction et conservation de l'état.
- `assets/phys1985-language.css` : menu tactile, cible d'au moins 44 px.
- Les textes produits en JavaScript passent par `physTranslate(...)` **avant**
  le rendu SVG, canvas ou MathJax. Les identifiants, valeurs des options, unités
  et expressions physiques ne sont pas traduits.
- Les textes HTML sont traduits avant la première composition MathJax.
- Le build inclut le catalogue et le moteur dans chaque HTML autonome et ZIP ;
  aucun service de traduction ni bibliothèque externe n'est chargé à l'exécution.

Pour ajouter du texte, compléter le catalogue et entourer le texte dynamique
avec `physTranslate(...)`. L'outil de préparation peut ajouter ces appels :

```sh
node tools/prepare_language.cjs /chemin/source/app.js /chemin/source/physics.js
python3 tools/build_apps.py --source nom_app=/chemin/source
```

La préparation analyse le JavaScript avec Acorn 8.18.0 (copie de développement
sous licence MIT dans `tools/vendor/`, jamais embarquée dans les apps). Elle est
idempotente et préserve les templates TeX bruts. Relire ses modifications lors
de l'ajout de nouvelles phrases. Les ZIP restent les sources de référence du
build ; sans `--source`, le build réutilise leurs appels de traduction existants.

## Vérifications

```sh
node tools/check_language.cjs
node tools/check_language_browser.cjs
node tools/check_language_options.cjs
BROWSER=webkit node tools/check_language_browser.cjs
BROWSER=firefox node tools/check_language_browser.cjs
LANGUAGE=en node tools/check_share_browser.cjs
LANGUAGE=en node tools/check_display_matrix.cjs
```

Les tests navigateur utilisent Playwright ; `NODE_PATH` peut désigner son
installation, `PLAYWRIGHT_BROWSERS_PATH` les moteurs WebKit/Firefox installés.
Les tests vérifient le retour FR/EN avec paramètres modifiés, la pause, les liens,
la préférence, les formules et les largeurs tablette. La matrice d'affichage
emploie les zooms **natifs** Chrome de 150 % et 200 %, avec un profil temporaire.
