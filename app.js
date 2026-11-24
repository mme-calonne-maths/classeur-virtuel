// Classeur virtuel : lit classeur.json, assemble les feuilles (garde, sommaire, intercalaires, PDF)
// et les donne à feuilleter.
import * as pdfjs from './vendor/pdf.min.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.js', import.meta.url).href;
const POLICES_PDF = new URL('./vendor/standard_fonts/', import.meta.url).href;

const A4 = 210 / 297;
const NB_COULEURS = 6;
// Les iPhone et iPad limitent la mémoire des images : on plafonne la taille de chaque page dessinée.
const PIXELS_MAX_PAGE = 4e6;
const PIXELS_MAX_LOUPE = 8e6;
const GARDER_AUTOUR = 4;   // pages gardées en mémoire de part et d'autre de la lecture
const DESSINER_AUTOUR = 3; // pages préparées d'avance
const ZOOMS = [1, 1.5, 2, 3];

const $ = (id) => document.getElementById(id);
const el = (balise, classe, texte) => {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
};
// Le numéro de version (changé à chaque mise en ligne) évite que GitHub serve une copie périmée d'un fichier.
let VERSION = '';
const adresse = (chemin) => chemin.split('/').map(encodeURIComponent).join('/') + (VERSION ? `?v=${VERSION.slice(0, 12)}` : '');
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const sansAnimation = matchMedia('(prefers-reduced-motion: reduce)');

const table = $('table');
const classeurEl = $('classeur');
const livre = $('livre');

let pages = [];       // toutes les feuilles, dans l'ordre
let rubriques = [];   // les intercalaires
let flip = null;      // la bibliothèque de feuilletage
let cible = null;     // page vers laquelle on est en train de sauter

/* ---------- Chargement des PDF ---------- */
const documentsOuverts = new Map();
function ouvrir(doc) {
  if (!documentsOuverts.has(doc.fichier)) {
    const tache = pdfjs.getDocument({ url: adresse(doc.fichier), standardFontDataUrl: POLICES_PDF });
    documentsOuverts.set(doc.fichier, tache.promise);
  }
  return documentsOuverts.get(doc.fichier);
}

/* ---------- Assemblage du classeur ---------- */
function decouperSommaire(lignes) {
  // Répartit les lignes du sommaire sur une ou plusieurs feuilles, sans laisser un titre seul en bas.
  const feuilles = [[]];
  let place = 15;
  lignes.forEach((ligne, i) => {
    const suivante = lignes[i + 1];
    const besoin = ligne.poids + (ligne.genre === 'entete' && suivante ? suivante.poids : 0);
    if (besoin > place && feuilles[feuilles.length - 1].length) {
      feuilles.push([]);
      place = 20;
    }
    feuilles[feuilles.length - 1].push(ligne);
    place -= ligne.poids;
  });
  return feuilles;
}

function assembler(donnees) {
  rubriques = donnees.rubriques.filter((r) => r.documents.length);
  rubriques.forEach((r, i) => { r.couleur = `c${(i % NB_COULEURS) + 1}`; });

  const lignes = rubriques.flatMap((r) => [
    { genre: 'entete', rubrique: r, poids: 2.5 },
    ...r.documents.map((d) => ({ genre: 'fiche', doc: d, poids: Math.ceil(d.titre.length / 30) })),
  ]);

  pages = [{ genre: 'garde' }];
  decouperSommaire(lignes).forEach((bloc, i) => pages.push({ genre: 'sommaire', lignes: bloc, suite: i > 0 }));
  for (const r of rubriques) {
    r.page = pages.length;
    pages.push({ genre: 'intercalaire', rubrique: r });
    for (const d of r.documents) {
      d.page = pages.length;
      for (let n = 1; n <= d.pages; n++) pages.push({ genre: 'pdf', rubrique: r, doc: d, numero: n });
    }
  }
  if (pages.length % 2) pages.push({ genre: 'notes' });
}

function ligneSommaire(titre, page) {
  const b = el('button', 'ligne');
  b.type = 'button';
  b.dataset.aller = page;
  b.append(el('span', 'ligne__titre', titre), el('span', 'ligne__points'), el('span', 'ligne__page', page + 1));
  return b;
}

function dessinerFeuille(p, i, donnees) {
  const page = el('div', 'page');
  page.dataset.density = 'soft';
  const f = el('div', 'feuille');
  page.append(f);

  if (p.genre === 'garde') {
    f.classList.add('seyes', 'garde');
    const etiquette = el('div', 'etiquette');
    etiquette.append(el('h2', 'etiquette__titre', donnees.titre), el('hr', 'etiquette__trait'));
    if (donnees.sousTitre) etiquette.append(el('p', 'etiquette__sous', donnees.sousTitre));
    if (donnees.enseignant) etiquette.append(el('p', 'etiquette__nom', donnees.enseignant));
    const conseil = el('p', 'conseil');
    conseil.innerHTML = '<b>Pour feuilleter</b> : fais glisser une page, utilise les flèches, ou touche un intercalaire.';
    f.append(etiquette, conseil);
  } else if (p.genre === 'sommaire') {
    f.classList.add('seyes', 'sommaire');
    const titre = el('h2', 'sommaire__titre');
    titre.append(el('span', '', p.suite ? 'Sommaire (suite)' : 'Sommaire'));
    const liste = el('div', 'sommaire__liste');
    for (const ligne of p.lignes) {
      if (ligne.genre === 'entete') {
        const b = el('button', `entete ${ligne.rubrique.couleur}`);
        b.type = 'button';
        b.dataset.aller = ligne.rubrique.page;
        b.append(el('span', 'entete__titre', ligne.rubrique.titre));
        liste.append(b);
      } else {
        liste.append(ligneSommaire(ligne.doc.titre, ligne.doc.page));
      }
    }
    f.append(titre, liste, el('span', 'folio', i + 1));
  } else if (p.genre === 'intercalaire') {
    const r = p.rubrique;
    f.classList.add('intercalaire', r.couleur);
    const liste = el('div', 'intercalaire__liste');
    liste.style.setProperty('--lignes', r.documents.length);
    r.documents.forEach((d) => liste.append(ligneSommaire(d.titre, d.page)));
    const nbPages = r.documents.reduce((s, d) => s + d.pages, 0);
    f.append(
      el('h2', 'intercalaire__titre', r.titre),
      el('p', 'intercalaire__compte', `${pluriel(r.documents.length, 'fiche')} · ${pluriel(nbPages, 'page')}`),
      liste,
      el('span', 'folio', i + 1),
    );
  } else if (p.genre === 'pdf') {
    f.append(el('p', 'attente', 'Chargement de la page…'));
  } else {
    f.classList.add('seyes');
  }
  // En page simple, la bibliothèque fait tourner une copie de la feuille : une copie de <canvas> est vide,
  // on y recopie donc l'image de la page.
  page.cloneNode = function (profond) {
    const copie = HTMLElement.prototype.cloneNode.call(this, profond);
    const origine = this.querySelector('canvas');
    const double = copie.querySelector('canvas');
    if (origine && double && origine.width) double.getContext('2d').drawImage(origine, 0, 0);
    return copie;
  };
  p.el = page;
  p.feuille = f;
  return page;
}

/* ---------- Dimensions : double page sur grand écran, page simple sinon ---------- */
function disposer() {
  const cadre = table.getBoundingClientRect();
  const zone = { width: cadre.width, height: cadre.height - 16 }; // un peu d'air pour l'ombre du classeur
  const double = zone.width >= 720 && zone.width > zone.height * 1.15;
  const bord = double ? Math.round(Math.min(12, Math.max(7, zone.width * 0.008))) : 6;
  let largeur;
  if (double) {
    const onglets = Math.round(Math.min(130, Math.max(88, zone.width * 0.1)));
    classeurEl.style.setProperty('--onglets', `${onglets}px`);
    largeur = Math.min(zone.width - onglets - 2 * bord, (zone.height - 2 * bord) * 2 * A4);
  } else {
    largeur = Math.min(zone.width - 2 * bord, (zone.height - 40 - 2 * bord) * A4);
  }
  largeur = Math.max(160, Math.floor(largeur));
  classeurEl.dataset.mode = double ? 'double' : 'simple';
  classeurEl.style.setProperty('--livre', `${largeur + (double ? 0 : 2 * bord)}px`);
  classeurEl.style.setProperty('--bord', `${bord}px`);
  livre.style.setProperty('--u', `${(double ? largeur / 2 : largeur) / 100}px`);
  if (flip) {
    // La bibliothèque choisit « page simple » quand la largeur passe sous 2 × minWidth : on s'en sert pour décider nous-mêmes.
    flip.getSettings().minWidth = double ? 1 : 1e6;
    flip.update();
  }
  return double;
}

/* ---------- Dessin des pages PDF, au plus près de la page affichée ---------- */
const densite = () => Math.min(window.devicePixelRatio || 1, 3);
const cleRendu = () => {
  const { pageWidth, height } = flip.getBoundsRect();
  return `${Math.round(pageWidth)}x${Math.round(height)}@${densite()}`;
};

// Safari ne rend la mémoire d'un canvas qu'une fois sa taille remise à zéro.
function jeter(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
  canvas.remove();
}

function prochaineADessiner() {
  const centre = cible ?? flip.getCurrentPageIndex();
  const cle = cleRendu();
  let choix = null;
  let distanceChoix = Infinity;
  pages.forEach((p, i) => {
    if (p.genre !== 'pdf') return;
    const distance = Math.min(Math.abs(i - centre), Math.abs(i - flip.getCurrentPageIndex()));
    if (distance > GARDER_AUTOUR && p.rendu) {
      // Loin de la lecture : on libère la mémoire.
      jeter(p.feuille.querySelector('canvas'));
      p.el.classList.remove('est-prete');
      p.rendu = null;
    }
    if (distance <= DESSINER_AUTOUR && p.rendu !== cle && !p.erreur && Math.abs(i - centre) < distanceChoix) {
      choix = p;
      distanceChoix = Math.abs(i - centre);
    }
  });
  return choix;
}

async function dessiner(p) {
  const cle = cleRendu();
  const { pageWidth, height } = flip.getBoundsRect();
  try {
    const page = await (await ouvrir(p.doc)).getPage(p.numero);
    const base = page.getViewport({ scale: 1 });
    let echelle = Math.min(pageWidth / base.width, height / base.height) * densite();
    const pixels = base.width * base.height * echelle * echelle;
    if (pixels > PIXELS_MAX_PAGE) echelle *= Math.sqrt(PIXELS_MAX_PAGE / pixels);
    const vue = page.getViewport({ scale: echelle });
    const canvas = el('canvas');
    canvas.width = Math.ceil(vue.width);
    canvas.height = Math.ceil(vue.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vue }).promise;
    jeter(p.feuille.querySelector('canvas'));
    p.feuille.append(canvas);
    p.el.classList.add('est-prete');
    p.rendu = cle;
  } catch (erreur) {
    console.error(`Page illisible : ${p.doc.fichier}`, erreur);
    p.erreur = true;
    p.feuille.querySelector('.attente').textContent = /404|Missing/i.test(`${erreur && (erreur.name + erreur.message)}`)
      ? `Cette fiche vient d'être mise à jour (${p.doc.titre}) : recharge la page pour la voir.`
      : `Cette page n'a pas pu être affichée (${p.doc.titre}).`;
  }
}

let dessinEnCours = false;
async function dessinerAutour() {
  if (dessinEnCours || !flip) return;
  dessinEnCours = true;
  try {
    for (let p = prochaineADessiner(); p; p = prochaineADessiner()) await dessiner(p);
  } finally {
    dessinEnCours = false;
  }
}

/* ---------- Navigation ---------- */
const estDouble = () => flip.getOrientation() === 'landscape';
function visibles() {
  const c = flip.getCurrentPageIndex();
  return estDouble() ? [c, c + 1].filter((i) => i < pages.length) : [c];
}

function aller(n, anime = true) {
  n = Math.max(0, Math.min(pages.length - 1, n));
  if (visibles().includes(n)) return;
  cible = n;
  dessinerAutour();
  if (anime && !sansAnimation.matches) flip.flip(n);
  else flip.turnToPage(n);
}
const suivante = () => (sansAnimation.matches ? flip.turnToNextPage() : flip.flipNext());
const precedente = () => (sansAnimation.matches ? flip.turnToPrevPage() : flip.flipPrev());

function decrire(indices) {
  const noms = [];
  for (const p of indices.map((i) => pages[i])) {
    const nom = p.genre === 'pdf' ? p.doc.titre
      : p.genre === 'intercalaire' ? p.rubrique.titre
      : p.genre === 'sommaire' ? 'Sommaire'
      : p.genre === 'garde' ? 'Page de garde' : '';
    if (nom && !noms.includes(nom)) noms.push(nom);
  }
  return noms.join(' · ');
}

function actualiser() {
  const vus = visibles();
  const premier = vus[0];
  const dernier = vus[vus.length - 1];
  $('ou-page').textContent = vus.length > 1
    ? `Pages ${premier + 1}–${dernier + 1} sur ${pages.length}`
    : `Page ${premier + 1} sur ${pages.length}`;
  $('ou-titre').textContent = decrire(vus);
  $('curseur').value = premier + 1;
  $('btn-prec').disabled = premier === 0;
  $('btn-suiv').disabled = dernier >= pages.length - 1;

  const rubriqueOuverte = vus.map((i) => pages[i].rubrique).filter(Boolean).pop();
  for (const b of $('onglets').children) {
    const ouvert = rubriques[b.dataset.rubrique] === rubriqueOuverte;
    b.classList.toggle('est-ouvert', ouvert);
    b.setAttribute('aria-current', ouvert ? 'true' : 'false');
    if (ouvert && classeurEl.dataset.mode === 'simple') b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  const pdfVus = vus.map((i) => pages[i]).filter((p) => p.genre === 'pdf');
  $('btn-loupe').disabled = pdfVus.length === 0;
  const lien = $('btn-pdf');
  lien.hidden = pdfVus.length === 0 || 'apercu' in $('app').dataset;
  if (pdfVus.length) {
    lien.href = adresse(pdfVus[0].doc.fichier);
    lien.setAttribute('aria-label', `Ouvrir le PDF : ${pdfVus[0].doc.titre}`);
  }
  try {
    history.replaceState(null, '', premier ? `#p${premier + 1}` : location.pathname + location.search);
  } catch { /* adresse non modifiable ici : sans importance */ }
}

const pageDansAdresse = () => {
  const m = /^#p(\d+)$/.exec(location.hash);
  return m ? Math.max(0, Math.min(pages.length - 1, Number(m[1]) - 1)) : null;
};

/* ---------- Gestes : la souris attrape le coin d'une page, le doigt balaie ou touche un bord ---------- */
function brancherGestes() {
  // Position dans le repère de la bibliothèque de feuilletage.
  const position = (e) => {
    const r = flip.getUI().getDistElement().getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const doigts = new Map();
  let sourisPosee = false;

  livre.addEventListener('pointerdown', (e) => {
    const surLien = Boolean(e.target.closest('a, button'));
    if (e.pointerType === 'touch') {
      doigts.set(e.pointerId, { x: e.clientX, y: e.clientY, surLien, seul: doigts.size === 0 });
      if (doigts.size > 1) doigts.forEach((d) => { d.seul = false; });
      return;
    }
    if (surLien || e.button !== 0) return;
    sourisPosee = true;
    flip.startUserTouch(position(e));
    e.preventDefault();
  });

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' && flip) flip.userMove(position(e), false);
  });

  addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') {
      if (sourisPosee) flip.userStop(position(e));
      sourisPosee = false;
      return;
    }
    const d = doigts.get(e.pointerId);
    doigts.delete(e.pointerId);
    if (!d || !d.seul) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 36 && Math.abs(dx) > 1.3 * Math.abs(dy)) {
      // Balayage : vers la gauche on avance, vers la droite on recule, où que le doigt se pose.
      (dx < 0 ? suivante : precedente)();
    } else if (!d.surLien && Math.hypot(dx, dy) < 10) {
      // Toucher simple : le bord droit avance, le bord gauche recule.
      const r = livre.getBoundingClientRect();
      const ou = (e.clientX - r.left) / r.width;
      if (ou > 0.78) suivante();
      else if (ou < 0.22) precedente();
    }
  });
  addEventListener('pointercancel', (e) => {
    doigts.delete(e.pointerId);
    if (e.pointerType !== 'touch' && sourisPosee) {
      sourisPosee = false;
      flip.userStop(position(e));
    }
  });
}

/* ---------- Loupe ---------- */
const loupe = $('loupe');
const loupeZone = $('loupe-zone');
let zoom = 0;
let tirage = 0;

async function dessinerLoupe() {
  const jeton = ++tirage;
  const aAgrandir = visibles().map((i) => pages[i]).filter((p) => p.genre === 'pdf');
  const largeur = Math.min(loupeZone.clientWidth - 32, 1000) * ZOOMS[zoom];
  $('loupe-moins').disabled = zoom === 0;
  $('loupe-plus').disabled = zoom === ZOOMS.length - 1;
  const toiles = [];
  for (const p of aAgrandir) {
    const page = await (await ouvrir(p.doc)).getPage(p.numero);
    const base = page.getViewport({ scale: 1 });
    let echelle = (largeur / base.width) * densite();
    const pixels = base.width * base.height * echelle * echelle;
    if (pixels > PIXELS_MAX_LOUPE) echelle *= Math.sqrt(PIXELS_MAX_LOUPE / pixels);
    const vue = page.getViewport({ scale: echelle });
    const canvas = el('canvas');
    canvas.width = Math.ceil(vue.width);
    canvas.height = Math.ceil(vue.height);
    canvas.style.width = `${Math.round(largeur)}px`;
    canvas.style.height = `${Math.round((largeur * base.height) / base.width)}px`;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vue }).promise;
    if (jeton !== tirage) return;
    toiles.push(canvas);
  }
  viderLoupe();
  loupeZone.append(...toiles);
}
function viderLoupe() {
  [...loupeZone.querySelectorAll('canvas')].forEach(jeter);
}

function ouvrirLoupe() {
  if ($('btn-loupe').disabled) return;
  $('loupe-titre').textContent = decrire(visibles().filter((i) => pages[i].genre === 'pdf'));
  loupe.hidden = false;
  zoom = loupeZone.clientWidth < 600 ? 1 : 0;
  viderLoupe();
  dessinerLoupe();
  $('loupe-fermer').focus();
}
function fermerLoupe() {
  tirage++;
  loupe.hidden = true;
  viderLoupe();
  $('btn-loupe').focus();
}
function zoomer(sens) {
  const nouveau = Math.max(0, Math.min(ZOOMS.length - 1, zoom + sens));
  if (nouveau === zoom) return;
  zoom = nouveau;
  dessinerLoupe();
}

/* ---------- Période d'ouverture d'un classeur ---------- */
function aujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const estOuvert = (c) => (!c.debut || aujourdhui() >= c.debut) && (!c.fin || aujourdhui() <= c.fin);
const dateEnClair = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/* ---------- Étagère : le choix du classeur quand il y en a plusieurs ---------- */
function afficherEtagere(donnees, demande) {
  const titre = donnees.enseignant ? `Les classeurs de ${donnees.enseignant}` : 'Les classeurs';
  document.title = titre;
  $('nom').textContent = titre;
  $('app').classList.add('est-etagere');
  if (!donnees.classeurs.length) {
    annoncer("Aucun classeur pour l'instant. Ils apparaîtront ici dès que des fiches seront ajoutées.", true);
    return;
  }
  annoncer(demande ? "Ce lien ne correspond à aucun classeur. Choisis le tien ci-dessous." : '', Boolean(demande));
  const etagere = el('nav', 'etagere');
  etagere.setAttribute('aria-label', 'Classeurs');
  for (const c of donnees.classeurs) {
    const n = c.rubriques.reduce((s, r) => s + r.documents.length, 0);
    const lien = el('a', 'dos');
    lien.href = `?classeur=${encodeURIComponent(c.lien)}`;
    lien.dataset.couleur = c.couleur || 'bleu';
    const etiquette = el('span', 'dos__etiquette');
    etiquette.append(el('span', 'dos__nom', c.nom), el('span', 'dos__titre', c.titre), el('span', 'dos__compte', pluriel(n, 'fiche')));
    lien.append(el('span', 'dos__anneaux'), etiquette);
    etagere.append(lien);
  }
  table.append(etagere);
}

/* ---------- Démarrage ---------- */
function annoncer(texte, erreur = false) {
  const m = $('message');
  m.textContent = texte;
  m.classList.toggle('est-erreur', erreur);
  m.hidden = !texte;
}

async function compterPagesManquantes(classeur) {
  // classeur.json donne normalement le nombre de pages ; sinon on ouvre le PDF pour le connaître.
  for (const r of classeur.rubriques) {
    for (const d of r.documents) {
      if (d.pages) continue;
      try {
        d.pages = (await ouvrir(d)).numPages;
      } catch (erreur) {
        console.error(`PDF illisible : ${d.fichier}`, erreur);
        d.pages = 0;
      }
    }
    r.documents = r.documents.filter((d) => d.pages > 0);
  }
}

async function demarrer() {
  let donnees;
  try {
    // Toujours la liste du jour : une copie de quelques minutes peut pointer vers des fiches renommées depuis.
    const reponse = await fetch(`classeur.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    donnees = await reponse.json();
  } catch (erreur) {
    console.error(erreur);
    annoncer("Le classeur n'a pas pu s'ouvrir. Vérifie ta connexion puis recharge la page.", true);
    return;
  }
  VERSION = donnees.version || '';
  // Ancien format (un seul classeur) : on l'emballe comme une liste d'un classeur.
  if (!Array.isArray(donnees.classeurs)) {
    donnees = {
      enseignant: donnees.enseignant || '',
      classeurs: [{ lien: '', nom: donnees.titre || 'Classeur', titre: donnees.titre || 'Classeur de mathématiques', sousTitre: donnees.sousTitre || '', couleur: 'bleu', rubriques: donnees.rubriques || [] }],
    };
  }
  const tous = donnees.classeurs;
  const ouverts = tous.filter(estOuvert);
  const demande = new URLSearchParams(location.search).get('classeur');
  const classeur = tous.find((c) => c.lien === demande) || (!demande && ouverts.length === 1 ? ouverts[0] : null);
  if (classeur && !estOuvert(classeur)) {
    document.title = classeur.nom;
    $('nom').textContent = classeur.nom;
    $('app').classList.add('est-etagere');
    annoncer(classeur.debut && aujourdhui() < classeur.debut
      ? `Ce classeur sera disponible à partir du ${dateEnClair(classeur.debut)}.`
      : `Ce classeur était disponible jusqu'au ${dateEnClair(classeur.fin)}.`, true);
    return;
  }
  if (!classeur) {
    afficherEtagere({ ...donnees, classeurs: ouverts }, demande);
    return;
  }
  if (ouverts.length > 1) $('btn-classeurs').hidden = false;
  document.documentElement.dataset.couleur = classeur.couleur || 'bleu';
  const garde = { titre: classeur.titre, sousTitre: classeur.sousTitre, enseignant: donnees.enseignant };
  donnees = garde;
  classeur.rubriques ??= [];
  await compterPagesManquantes(classeur);
  assembler(classeur);

  document.title = tous.length > 1 ? `${classeur.nom} · ${classeur.titre}` : classeur.titre;
  $('nom').textContent = document.title;
  if (!rubriques.length) {
    annoncer("Ce classeur est encore vide. Les fiches apparaîtront ici dès qu'elles seront ajoutées.", true);
    return;
  }

  const feuilles = pages.map((p, i) => dessinerFeuille(p, i, donnees));
  livre.append(...feuilles);

  const onglets = $('onglets');
  rubriques.forEach((r, i) => {
    const b = el('button', `onglet ${r.couleur}`, r.titre);
    b.type = 'button';
    b.dataset.rubrique = i;
    b.title = r.titre;
    b.addEventListener('click', () => aller(r.page));
    onglets.append(b);
  });

  classeurEl.hidden = false;
  annoncer('');
  const double = disposer();

  flip = new St.PageFlip(livre, {
    width: 420, height: Math.round(420 / A4), size: 'stretch',
    minWidth: 120, maxWidth: 4000, minHeight: 100, maxHeight: 6000,
    showCover: false, usePortrait: true, mobileScrollSupport: false,
    flippingTime: 650, maxShadowOpacity: 0.35, drawShadow: true,
    useMouseEvents: false, showPageCorners: true, // les gestes sont gérés par brancherGestes()
    startPage: pageDansAdresse() ?? 0,
  });
  flip.getSettings().minWidth = double ? 1 : 1e6;
  flip.loadFromHTML(feuilles);
  flip.update();

  flip.on('flip', () => { cible = null; actualiser(); dessinerAutour(); });
  flip.on('changeOrientation', () => { actualiser(); dessinerAutour(); });

  const curseur = $('curseur');
  curseur.max = pages.length;
  curseur.addEventListener('input', () => {
    $('ou-page').textContent = `Page ${curseur.value} sur ${pages.length}`;
    $('ou-titre').textContent = decrire([curseur.value - 1]);
  });
  curseur.addEventListener('change', () => { aller(curseur.value - 1, false); actualiser(); });

  $('btn-prec').addEventListener('click', precedente);
  $('btn-suiv').addEventListener('click', suivante);
  $('btn-sommaire').addEventListener('click', () => aller(1));
  $('btn-loupe').addEventListener('click', ouvrirLoupe);
  $('loupe-fermer').addEventListener('click', fermerLoupe);
  $('loupe-moins').addEventListener('click', () => zoomer(-1));
  $('loupe-plus').addEventListener('click', () => zoomer(1));
  livre.addEventListener('click', (e) => {
    const b = e.target.closest('[data-aller]');
    if (b) aller(Number(b.dataset.aller));
  });
  brancherGestes();

  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (!loupe.hidden) {
      if (e.key === 'Escape') fermerLoupe();
      else if (e.key === '+' || e.key === '=') zoomer(1);
      else if (e.key === '-') zoomer(-1);
      return;
    }
    if (e.target.closest('input, button, a')) {
      if (e.target.matches('input') || e.key === ' ' || e.key === 'Enter') return;
    }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') suivante();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') precedente();
    else if (e.key === 'Home') aller(0);
    else if (e.key === 'End') aller(pages.length - 1);
    else return;
    e.preventDefault();
  });
  addEventListener('hashchange', () => {
    const n = pageDansAdresse();
    if (n !== null) aller(n);
  });

  let attente = 0;
  new ResizeObserver(() => {
    clearTimeout(attente);
    attente = setTimeout(() => {
      disposer();
      actualiser();
      dessinerAutour();
      if (!loupe.hidden) dessinerLoupe();
    }, 80);
  }).observe(table);

  actualiser();
  dessinerAutour();
}

demarrer();
