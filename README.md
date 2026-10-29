# KiAct · Diagnostic B Corp V2

Outil interne de cadrage B Corp de KiAct Consulting, version 2.1.0 du 29 octobre 2026.

Adresse en ligne : https://peetersevelyne.github.io/KiAct-Diagnostic-BCorp/

Référentiel : Standards B Lab V2.2 du 20 février 2026, mises à jour vérifiées le 29 octobre 2026. Le détail des évolutions figure dans `CHANGELOG.md`.

## Contenu du dépôt

```
index.html                  Point d'entrée de la page
.nojekyll                   Fichier vide indispensable à GitHub Pages
README.md                   Présente notice
CHANGELOG.md                Journal des modifications
assets/
  index-DaSx-hwI.js         Code compilé
  index-cXlCuMns.css        Styles
  favicon-27NaBrDu.svg      Icône d'onglet
src/
  KiAct_BCorp_Diagnostic.jsx   Source de référence (React)
  main.jsx                     Point d'entrée React
  storage-shim.js              Couche window.storage vers localStorage
  index.css, favicon.svg       Styles et icône sources
  index.source.html            Page source utilisée par Vite
  package.json, vite.config.js Configuration de compilation
```

Le dossier `src/` sert à conserver le source dans le dépôt. GitHub Pages ne l'utilise pas pour afficher l'outil.

## Mettre à jour le site sur GitHub

1. Ouvrez le dépôt https://github.com/peetersevelyne/KiAct-Diagnostic-BCorp.
2. Supprimez l'ancien fichier compilé `assets/index-DzFNIwTh.js`. Ouvrez-le dans GitHub, puis utilisez le menu « … » et « Delete file ».
3. Choisissez « Add file » puis « Upload files ».
4. Glissez-déposez tout le contenu du dossier `depot-github`, dossiers `assets` et `src` compris.
5. Validez avec « Commit changes », par exemple avec le message « Version 2.1.0 du 29 octobre 2026 ».
6. Après une à deux minutes, ouvrez l'adresse en ligne et forcez le rafraîchissement (Ctrl+F5, ou Cmd+Maj+R sur Mac).

Précautions

- Le fichier `.nojekyll` est masqué sur la plupart des ordinateurs. S'il n'apparaît pas dans le dépôt, créez-le avec « Add file » puis « Create new file », nommé `.nojekyll` et laissé vide.
- Les dossiers `assets` et `src` se déposent comme dossiers, et non fichier par fichier.
- La traduction automatique de Chrome peut afficher « actifs » au lieu de `assets`, sans changer le nom réel.

## Utilisation en rendez-vous

- Ouvrez l'adresse dans Chrome ou Safari et ajoutez-la à vos favoris.
- Les diagnostics s'enregistrent automatiquement dans le navigateur de l'ordinateur utilisé.
- Après chaque rendez-vous, exportez le diagnostic depuis « Mes diagnostics » (bouton « Exporter ») et classez le fichier dans le dossier du client.
- Le bouton « Importer un fichier » restaure un diagnostic sur n'importe quel poste.
- Les données sont perdues si vous effacez les données du site, et ne sont pas conservées en navigation privée.
- Aucune donnée client ne figure dans le code publié.

## Recompiler à partir du source

La compilation est faite par Claude lors des évolutions. Pour mémoire, la page `src/index.source.html` devient `index.html` à la racine du projet de compilation, avec `package.json` et `vite.config.js`, puis `npm install` et `npm run build` produisent le dossier `dist/`. Le préfixe `/KiAct-Diagnostic-BCorp/` et la couche `storage-shim.js` doivent être conservés.

© KiAct Consulting, outil interne
