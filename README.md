# Classeur virtuel

Un classeur de mathématiques à feuilleter en ligne : les fiches PDF (cours, méthodes, exercices…)
sont rangées derrière des intercalaires, avec un sommaire, et les pages se tournent comme dans un vrai classeur.
Il fonctionne sur ordinateur, tablette et téléphone.

## Ajouter une fiche

1. Ouvrir le dossier `pdf/`, puis le dossier de l'intercalaire voulu (par exemple `1 - Cours`).
2. Cliquer sur **Add file → Upload files**, déposer le PDF, puis **Commit changes**.
3. Attendre une à deux minutes : le sommaire est refait et le classeur est remis en ligne tout seul.

Pour retirer une fiche, ouvrir le fichier puis **Delete file**.

## Noms et ordre

- Chaque **dossier** de `pdf/` est un intercalaire ; chaque **PDF** qu'il contient est une fiche.
- Le nom du fichier devient le titre affiché : `2 - Opérations sur les fractions.pdf` s'affiche « Opérations sur les fractions ».
- Le numéro au début du nom sert seulement à ranger (1, 2, 3… 10, 11) ; il n'est pas affiché.
- Pour créer un nouvel intercalaire, déposer un dossier entier (par exemple `4 - Devoirs`) dans `pdf/` depuis l'ordinateur.

## Changer le titre du classeur

Modifier `reglages.json` :

```json
{
  "titre": "Classeur de mathématiques",
  "sousTitre": "Cours, méthodes et exercices",
  "enseignant": "Mme Calonne"
}
```

## Bon à savoir

- Viser des PDF de moins de 5 Mo chacun : au-delà, les pages mettent du temps à s'afficher sur téléphone.
  Les documents scannés gagnent à être compressés avant dépôt.
- Le classeur n'est pas référencé par les moteurs de recherche, mais il n'a pas de mot de passe :
  toute personne qui a le lien peut le consulter.
- `classeur.json` est écrit automatiquement à partir du dossier `pdf/` : inutile de le modifier à la main.

## Essayer sur son ordinateur

```
node tools/construire-sommaire.mjs
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000.

## Composants utilisés

[PDF.js](https://mozilla.github.io/pdf.js/) (Apache 2.0) pour afficher les PDF,
[StPageFlip](https://github.com/Nodlik/StPageFlip) (MIT) pour l'effet de page tournée,
polices Playwrite FR Moderne et Atkinson Hyperlegible (SIL OFL). Tout est hébergé avec le classeur :
aucune donnée n'est envoyée à un service extérieur.
