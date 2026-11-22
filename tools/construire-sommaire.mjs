// Parcourt le dossier pdf/ et écrit classeur.json (la liste des intercalaires et des fiches).
// Lancé automatiquement à chaque mise en ligne ; à la main : node tools/construire-sommaire.mjs
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossierPdf = join(racine, 'pdf');
const tri = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

// "02 - Méthodes" -> "Méthodes" ; "3_Exercices.pdf" -> "Exercices"
const titre = (nom) =>
  nom.replace(/\.pdf$/i, '').replace(/^\s*\d+\s*[-–—_.)]*\s*/, '').replace(/_/g, ' ').trim().normalize('NFC') || nom;

const estPdf = (e) => e.isFile() && /\.pdf$/i.test(e.name);
const lister = async (dossier) =>
  (await readdir(dossier, { withFileTypes: true }))
    .filter((e) => !e.name.startsWith('.'))
    .sort((a, b) => tri.compare(a.name, b.name));

let pdfjs = null;
try {
  pdfjs = await import(pathToFileURL(join(racine, 'vendor/pdf.min.js')).href);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(join(racine, 'vendor/pdf.worker.min.js')).href;
} catch {
  // Sans lecteur PDF ici, l'application comptera elle-même les pages à l'ouverture.
}

async function compterPages(chemin) {
  if (!pdfjs) return undefined;
  try {
    const tache = pdfjs.getDocument({ data: new Uint8Array(await readFile(chemin)), verbosity: 0 });
    const doc = await tache.promise;
    const n = doc.numPages;
    await tache.destroy();
    return n;
  } catch (erreur) {
    console.warn(`  ! illisible : ${chemin} (${erreur.message})`);
    return null;
  }
}

async function fiches(dossier, relatif) {
  const liste = [];
  for (const e of (await lister(dossier)).filter(estPdf)) {
    const pages = await compterPages(join(dossier, e.name));
    if (pages === null) continue;
    liste.push({ titre: titre(e.name), fichier: `${relatif}/${e.name}`, ...(pages ? { pages } : {}) });
  }
  return liste;
}

let reglages = {};
try {
  reglages = JSON.parse(await readFile(join(racine, 'reglages.json'), 'utf8'));
} catch {
  console.warn('reglages.json absent ou invalide : titre par défaut.');
}

const rubriques = [];
const entrees = await lister(dossierPdf).catch(() => []);
for (const e of entrees.filter((x) => x.isDirectory())) {
  const documents = await fiches(join(dossierPdf, e.name), `pdf/${e.name}`);
  if (documents.length) rubriques.push({ titre: titre(e.name), documents });
}
const isoles = await fiches(dossierPdf, 'pdf').catch(() => []);
if (isoles.length) rubriques.push({ titre: 'Autres documents', documents: isoles });

const classeur = {
  titre: reglages.titre || 'Classeur de mathématiques',
  sousTitre: reglages.sousTitre || '',
  enseignant: reglages.enseignant || '',
  rubriques,
};
await writeFile(join(racine, 'classeur.json'), JSON.stringify(classeur, null, 2) + '\n');

const nbFiches = rubriques.reduce((s, r) => s + r.documents.length, 0);
const nbPages = rubriques.reduce((s, r) => s + r.documents.reduce((t, d) => t + (d.pages || 0), 0), 0);
console.log(`classeur.json : ${rubriques.length} intercalaire(s), ${nbFiches} fiche(s), ${nbPages} page(s).`);
