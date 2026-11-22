// Parcourt les classeurs et écrit classeur.json (la liste des classeurs, de leurs intercalaires et de leurs fiches).
// Lancé automatiquement à chaque mise en ligne ; à la main : node tools/construire-sommaire.mjs
//
// Rangement attendu :
//   classeurs/1 - 6e A/reglages.json          (page de garde de ce classeur, facultatif)
//   classeurs/1 - 6e A/1 - Cours/1 - Les fractions.pdf
// L'ancien rangement (pdf/1 - Cours/1 - Les fractions.pdf) reste lu, comme un classeur de plus.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const tri = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

// "02 - Méthodes" -> "Méthodes" ; "3_Exercices.pdf" -> "Exercices"
const titre = (nom) =>
  nom.replace(/\.pdf$/i, '').replace(/^\s*\d+\s*[-–—_.)]*\s*/, '').replace(/_/g, ' ').trim().normalize('NFC') || nom;
// "6e A" -> "6e-a" : sert dans le lien donné aux élèves (…/?classeur=6e-a)
export const lienDepuis = (nom) =>
  nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'classeur';

const estPdf = (e) => e.isFile() && /\.pdf$/i.test(e.name);
const lister = async (dossier) =>
  (await readdir(dossier, { withFileTypes: true }).catch(() => []))
    .filter((e) => !e.name.startsWith('.'))
    .sort((a, b) => tri.compare(a.name, b.name));
const lireJson = async (chemin) => {
  try { return JSON.parse(await readFile(chemin, 'utf8')); } catch { return {}; }
};

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

async function lireClasseur(dossier, relatif) {
  const rubriques = [];
  for (const e of (await lister(dossier)).filter((x) => x.isDirectory())) {
    const documents = await fiches(join(dossier, e.name), `${relatif}/${e.name}`);
    if (documents.length) rubriques.push({ titre: titre(e.name), documents });
  }
  const isoles = await fiches(dossier, relatif);
  if (isoles.length) rubriques.push({ titre: 'Autres documents', documents: isoles });
  return rubriques;
}

const general = await lireJson(join(racine, 'reglages.json'));
const classeurs = [];
const liensPris = new Set();
const ajouter = (nom, reglages, rubriques) => {
  if (!rubriques.length) return;
  let lien = lienDepuis(reglages.lien || nom);
  for (let n = 2; liensPris.has(lien); n++) lien = `${lienDepuis(reglages.lien || nom)}-${n}`;
  liensPris.add(lien);
  classeurs.push({
    lien,
    nom,
    titre: reglages.titre || 'Classeur de mathématiques',
    sousTitre: reglages.sousTitre ?? nom,
    couleur: reglages.couleur || 'bleu',
    rubriques,
  });
};

for (const e of (await lister(join(racine, 'classeurs'))).filter((x) => x.isDirectory())) {
  const dossier = join(racine, 'classeurs', e.name);
  ajouter(titre(e.name), await lireJson(join(dossier, 'reglages.json')), await lireClasseur(dossier, `classeurs/${e.name}`));
}
// Ancien rangement : un seul classeur dans pdf/, réglé par reglages.json à la racine.
ajouter(general.nom || 'Mon classeur', { titre: general.titre, sousTitre: general.sousTitre || '', lien: general.lien }, await lireClasseur(join(racine, 'pdf'), 'pdf'));

const sortie = {
  enseignant: general.enseignant || '',
  version: process.env.GITHUB_SHA || '',
  classeurs,
};
await writeFile(join(racine, 'classeur.json'), JSON.stringify(sortie, null, 2) + '\n');

const nbFiches = classeurs.reduce((s, c) => s + c.rubriques.reduce((t, r) => t + r.documents.length, 0), 0);
console.log(`classeur.json : ${classeurs.length} classeur(s), ${nbFiches} fiche(s).`);
