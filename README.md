# Classeurs virtuels

Des classeurs de mathématiques à feuilleter en ligne, un par classe : les fiches PDF (cours, méthodes, exercices…)
sont rangées derrière des intercalaires, avec un sommaire, et les pages se tournent comme dans un vrai classeur.
Ils fonctionnent sur ordinateur, tablette et téléphone.

## Tout se gère depuis la page de gestion

Ouvrir `gestion.html` (l'adresse du site suivie de `gestion.html`). On y peut :

- créer un classeur par classe, choisir sa couleur, le titre et le sous-titre de sa page de garde ;
- copier le lien à donner aux élèves de chaque classe ;
- ajouter, renommer, ranger, déplacer ou supprimer des intercalaires et des fiches PDF ;
- toucher **Publier** : tout est mis en ligne en une minute environ.

La première fois, la page demande une clé d'accès GitHub et explique comment la créer.

## Liens

- `…/classeur-virtuel/` : l'étagère avec tous les classeurs.
- `…/classeur-virtuel/?classeur=6e-a` : directement le classeur d'une classe (lien affiché dans la page de gestion).

## Rangement des fichiers

La page de gestion range tout elle-même :

```
classeurs/1 - 6e A/reglages.json               page de garde et couleur de ce classeur
classeurs/1 - 6e A/1 - Cours/1 - Les fractions.pdf
reglages.json                                   nom affiché sur toutes les pages de garde
```

`classeur.json` est écrit automatiquement à chaque mise en ligne : inutile de le modifier.

## Mettre à jour l'application

`gestion.html` contient une copie des fichiers de l'application (`node tools/assembler-gestion.mjs` la met à jour).
Quand cette copie diffère de ce qui est en ligne, la page de gestion propose de l'installer à la prochaine publication.
Une nouvelle `gestion.html` reçue s'installe depuis la page de gestion elle-même (« Installer une mise à jour reçue »).

## Essayer sur son ordinateur

```
node tools/construire-sommaire.mjs
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000.

## Composants utilisés

[PDF.js](https://mozilla.github.io/pdf.js/) (Apache 2.0) pour afficher les PDF,
[StPageFlip](https://github.com/Nodlik/StPageFlip) (MIT) pour l'effet de page tournée,
polices Playwrite FR Moderne et Atkinson Hyperlegible (SIL OFL). Tout est hébergé avec le site :
aucune donnée n'est envoyée à un service extérieur, sauf les échanges de la page de gestion avec GitHub.
