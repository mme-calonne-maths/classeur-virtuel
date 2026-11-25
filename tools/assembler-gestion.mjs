// Range dans gestion.html la version actuelle des fichiers du classeur.
// La page de gestion compare cette copie avec ce qui est en ligne et installe la différence à la prochaine publication.
// À lancer après chaque modification de l'application : node tools/assembler-gestion.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const FICHIERS = ['index.html', 'app.js', 'style.css', 'README.md', 'tools/construire-sommaire.mjs', 'tools/assembler-gestion.mjs', '.github/workflows/mise-en-ligne.yml'];

const contenu = {};
for (const f of FICHIERS) contenu[f] = await readFile(join(racine, f), 'utf8');
// Les « < » sont écrits \u003c pour que ce texte ne puisse pas fermer la balise <script> qui le contient.
const json = JSON.stringify(contenu).replace(/</g, '\\u003c');

const chemin = join(racine, 'gestion.html');
const page = await readFile(chemin, 'utf8');
const motif = /(<script type="application\/json" id="mise-a-jour">)[\s\S]*?(<\/script>)/;
if (!motif.test(page)) throw new Error('Bloc « mise-a-jour » introuvable dans gestion.html');
await writeFile(chemin, page.replace(motif, (_, debut, fin) => debut + json + fin));
console.log(`gestion.html : ${FICHIERS.length} fichiers rangés (${Math.round(json.length / 1024)} Ko).`);
