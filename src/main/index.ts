import './avant'
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { VOIX, VOIX_GEMINI, type Etat, type Cite, type Evenement, type Humeur, type Mode, type PieceJointe, type Reglages, type Reponse, type VoixEleven } from '@shared/types'
import * as agent from './agent'
import * as comptes from './comptes'
import { etatClaude, noterConnexion, reprendrePathDuShell } from './claude'
import {
  aTous, basculerPanneau, basculerPlein, cacherPanneau, creerBulle, fermerPanneau, creerPanneau, deplacerBulle, laBulle, lePanneau, ouvrirPanneau, rangerBulle
} from './fenetres'
import * as fils from './fils'
import { journal } from './journal'
import * as outils from './outils'
import * as projets from './projets'
import * as reglages from './reglages'
import * as updates from './updates'
import { attentePrete, creerVoix, estEleven, estGemini, prechaufferAttentes, quandMuet, QuotaEleven, QuotaGemini, synthetiser, voixEleven } from './voix'

/**
 * Encre : une bulle toujours au-dessus, un panneau de chat branché sur le
 * Claude Code de la machine. Ce fichier fait le démarrage et les échanges
 * avec les deux fenêtres.
 */

app.setName('Encre')
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => ouvrirPanneau())

// Ctrl+Alt+Espace est souvent pris (PowerToys, dictée) et Ctrl+Alt = AltGr sur
// un clavier AZERTY (Ctrl+Alt+E tape €) : on prend le premier libre.
const RACCOURCIS: [string, string][] = [
  ['Control+Shift+Space', 'Ctrl+Maj+Espace'],
  ['Control+Shift+Alt+Space', 'Ctrl+Maj+Alt+Espace']
]
/** Parler, comme VoiceType (Alt+Maj+R) : E pour Encre. Jamais Ctrl+Alt (AltGr en AZERTY). */
const RACCOURCIS_PARLER: [string, string][] = [
  ['Alt+Shift+E', 'Alt+Maj+E'],
  ['Control+Shift+E', 'Ctrl+Maj+E']
]
let toucheParler = 'aucun'

/** Ouvre l'écoute, ou envoie ce qui a été dit. Le panneau peut rester fermé : la bulle montre qu'Encre écoute. */
/**
 * L'icône près de l'horloge : quoi qu'il arrive à la bulle (cachée derrière
 * un plein écran, fenêtre perdue), on retrouve Tako d'un clic.
 */
let zoneNotif: Tray | null = null
function poserIcone(): void {
  const image = nativeImage.createFromPath(join(dossierAssets(), 'icon.png'))
  const petite = image.resize({ width: 16, height: 16, quality: 'best' })
  petite.addRepresentation({ scaleFactor: 2, width: 32, height: 32, buffer: image.resize({ width: 32, height: 32, quality: 'best' }).toPNG() })
  zoneNotif = new Tray(petite)
  zoneNotif.setToolTip('Encre · Tako')
  zoneNotif.on('click', () => {
    laBulle()?.showInactive()
    ouvrirPanneau()
  })
  menuNotif()
}
/** Refait à chaque mise à jour prête : elle s'y propose. */
function menuNotif(): void {
  zoneNotif?.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Ouvrir Tako', click: () => { laBulle()?.showInactive(); ouvrirPanneau() } },
      { label: 'Parler', click: () => dicter(false) },
      ...(majPrete ? [{ label: `Mettre à jour (version ${majPrete})`, click: () => void updates.installer() }] : []),
      { type: 'separator' },
      { label: 'Quitter Encre', click: () => app.quit() }
    ])
  )
}

function dicter(mainsLibres: boolean): void {
  ;(lePanneau() ?? creerPanneau()).webContents.send('dicter', mainsLibres)
}
let raccourci = 'aucun'
let majPrete: string | null = null

let humeur: Humeur = 'repos'
let retourRepos: NodeJS.Timeout | null = null
function changerHumeur(h: Humeur): void {
  humeur = h
  if (retourRepos) clearTimeout(retourRepos)
  // « Fini » reste quelques secondes, le temps de le voir, puis il se repose.
  if (h === 'fini') retourRepos = setTimeout(() => changerHumeur('repos'), 6000)
  aTous('humeur', h)
}

/**
 * Plusieurs projets peuvent travailler à la fois : chacun a son humeur, la
 * bulle montre la plus pressante (une autorisation attendue d'abord).
 */
const humeurs = new Map<string, Humeur>()
const RANG: Partial<Record<Humeur, number>> = { accord: 3, bosse: 2, reflechit: 1, note: 0.5 }
function humeurDe(projet: string, h: Humeur): void {
  if (RANG[h]) humeurs.set(projet, h)
  else humeurs.delete(projet)
  const vives = [...humeurs.values()].sort((a, b) => (RANG[b] ?? 0) - (RANG[a] ?? 0))
  changerHumeur(vives[0] ?? h)
  publierEtat()
}

function etat(): Etat {
  return {
    projets: projets.projets(),
    actif: projets.actifId(),
    claude: etatClaude(),
    comptes: comptes.comptes(),
    enCours: agent.projetsEnCours(),
    attend: [...humeurs].filter(([, h]) => h === 'accord').map(([id]) => id),
    reglages: reglages.reglages(),
    version: app.getVersion(),
    majPrete,
    toucheParler,
    limites: agent.limitesConnues()
  }
}
const publierEtat = (): void => lePanneau()?.webContents.send('etat', etat())

/** Note l'événement dans le fil du projet et le montre au panneau. */
function diffuser(projet: string, ev: Evenement): void {
  fils.noter(projet, ev)
  lePanneau()?.webContents.send('evenement', projet, ev)
}

async function ajouterProjet(): Promise<void> {
  const p = lePanneau()
  const r = p
    ? await dialog.showOpenDialog(p, { title: 'Dossier du projet', properties: ['openDirectory'] })
    : await dialog.showOpenDialog({ title: 'Dossier du projet', properties: ['openDirectory'] })
  if (!r.canceled && r.filePaths[0]) projets.ajouter(r.filePaths[0])
  publierEtat()
}

/** Lancer Encre à l'ouverture de session. Seulement l'app installée : en développement, ce serait electron.exe. */
function appliquerDemarrage(r: Reglages): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: r.demarrage, args: ['--demarrage'] })
}

/** Libre est un brouillon : il repart à vide (fil et session) chaque fois qu'on y revient. */
function viderLibre(): void {
  const l = projets.projets().find((x) => x.libre)
  if (!l) return
  fils.vider(l.id)
  projets.modifier(l.id, { session: null })
}

/**
 * `relance` : le tour qui suit une création de projet depuis Libre. La
 * demande est déjà dans le fil déplacé : on ne la réaffiche pas.
 */
/**
 * Ce que Claude reçoit quand on répond à des passages : chacun en citation
 * Markdown suivi de ce qu'on y répond, puis le message. On peut en cumuler
 * plusieurs (répondre à la question 1, puis à la 2, en un seul envoi).
 */
function citer(citations: Cite[] | undefined, texte: string): string {
  const liste = (citations ?? []).filter((c) => c.passage.trim())
  if (!liste.length) return texte
  const blocs = liste.map((c) => {
    const cite = c.passage.trim().split('\n').map((l) => `> ${l}`).join('\n')
    return c.reponse?.trim() ? `${cite}\n\n${c.reponse.trim()}` : cite
  })
  const intro = liste.length > 1 ? 'Je réponds à plusieurs passages de ta réponse, chacun suivi de ma réponse :' : 'Je réponds à ce passage de ta réponse :'
  // Le champ du bas est un message neutre : sans ce « Par ailleurs », Claude le lirait comme la réponse au dernier passage.
  const suite = texte.trim() && liste.every((c) => c.reponse?.trim()) ? `Par ailleurs :\n${texte}` : texte
  return [`${intro}\n${blocs.join('\n\n')}`, suite].filter((x) => x.trim()).join('\n\n')
}

/**
 * Les messages écrits pendant un tour qui n'ont pas pu y être glissés (il se
 * terminait) : ils partent dans l'ordre dès qu'il est fini.
 */
const suivants = new Map<string, { texte: string; pieces: PieceJointe[] }[]>()
/**
 * Les projets dont le tour a commencé à la voix : seul leur fin rend le micro
 * (« tour-fini »), pas celle d'un autre projet qui travaillait derrière.
 */
const vocaux = new Set<string>()

/**
 * `cible` : le projet où envoyer (par défaut celui qu'on regarde). Les
 * relances (Libre qui déménage, messages en attente) visent leur projet même
 * si l'utilisateur est parti ailleurs entre-temps.
 */
function envoyer(texte: string, pieces: PieceJointe[], voix: boolean, relance?: string, citations?: Cite[], cible?: string): void {
  const p = cible ? projets.trouver(cible) : projets.actif()
  const cites = citations?.filter((c) => c.passage.trim()).map((c) => ({ passage: c.passage.trim(), reponse: c.reponse?.trim() || undefined }))
  if (!p || (!texte.trim() && !pieces.length && !cites?.some((c) => c.reponse))) return
  const moi = (pendant?: boolean): Evenement => ({
    type: 'moi', texte, pieces: pieces.length ? pieces.map((x) => x.nom) : undefined, voix: voix || undefined,
    citations: cites?.length ? cites : undefined, pendant
  })
  // Tako travaille déjà sur ce projet : le message rejoint son tour (comme
  // dans Claude Code), ou attend la fin s'il est trop tard pour l'y glisser.
  // Les autres projets, eux, travaillent en parallèle.
  if (agent.enCours(p.id)) {
    if (!relance) diffuser(p.id, moi(true))
    const message = relance ?? citer(cites, texte)
    if (!agent.glisser(p.id, message, pieces)) suivants.set(p.id, [...(suivants.get(p.id) ?? []), { texte: message, pieces }])
    return
  }
  if (!relance) diffuser(p.id, moi())
  if (voix) vocaux.add(p.id)
  const r = reglages.reglages()
  const audio = (mp3: Buffer): void => lePanneau()?.webContents.send('audio', mp3.toString('base64'))
  // En mode Parler, un silence de plusieurs secondes sonne comme une panne :
  // une courte phrase d'attente (« Je regarde. ») le comble, comme dans Iris.
  let parle = false
  const attente = voix
    ? setTimeout(() => {
        const mp3 = parle ? null : attentePrete()
        if (mp3) audio(mp3)
      }, 1800)
    : null
  /** Le projet que Tako a créé ou ouvert pendant ce tour. */
  let ouvert: string | null = null
  void agent
    .envoyer(
      p,
      relance ?? citer(cites, texte),
      {
        evenement: (ev) => {
          if (ev.type === 'texte') parle = true
          diffuser(p.id, ev)
          // Vérification du parcours Libre : personne pour cliquer, on trace et on autorise.
          if (process.env.ENCRE_VERIF_LIBRE && ev.type !== 'texte') {
            journal(`verif ${p.nom} ${ev.type} ${JSON.stringify(ev).slice(0, 240)}`)
            if (ev.type === 'demande') agent.repondre(ev.demande.id, 'oui')
          }
        },
        humeur: (h) => humeurDe(p.id, h),
        projets: publierEtat,
        // Le projet ouvert par Tako ne prend l'écran que si on regardait celui-ci.
        ouvert: (id) => {
          ouvert = id
          if (projets.actifId() === p.id) projets.choisir(id)
        },
        audio,
        limites: publierEtat
      },
      { pieces, voix: voix ? r.voix : undefined }
    )
    .then(() => {
      if (attente) clearTimeout(attente)
      fils.ecrire()
      // Depuis Libre, Tako a créé (ou ouvert) un projet : la conversation y
      // déménage, Libre repart à vide, et le travail commence là-bas tout de suite.
      if (p.libre && !relance && ouvert && ouvert !== p.id) {
        const arrivee = ouvert
        vocaux.delete(p.id)
        fils.deplacer(p.id, arrivee)
        projets.modifier(p.id, { session: null })
        publierEtat()
        lePanneau()?.webContents.send('fil-change', arrivee)
        const suite = `Ce projet vient d’être ouvert depuis Libre pour cette demande : « ${texte} ». Mets-toi au travail.`
        return void envoyer(texte, pieces, voix, suite, undefined, arrivee)
      }
      // Tako a ouvert un sujet pour cette demande : l'ancien fil reste à sa
      // place, la demande repart dans le sujet neuf (session vierge, fil léger).
      const sujet = ouvert && ouvert !== p.id ? projets.trouver(ouvert) : null
      if (!p.libre && !relance && sujet && projets.racineDe(sujet).id === projets.racineDe(p).id) {
        vocaux.delete(p.id)
        diffuser(sujet.id, moi())
        publierEtat()
        if (projets.actifId() === sujet.id) lePanneau()?.webContents.send('fil-change', sujet.id)
        const suite = `Ce sujet vient d’être ouvert pour cette demande : « ${texte} ». Mets-toi au travail.`
        return void envoyer(texte, pieces, voix, suite, undefined, sujet.id)
      }
      // Déjà affichés dans le fil : ils partent sans y revenir.
      const tout = suivants.get(p.id) ?? []
      suivants.delete(p.id)
      if (tout.length) {
        const message = tout.map((s) => s.texte).join('\n\n')
        return void envoyer(message, tout.flatMap((s) => s.pieces), false, message, undefined, p.id)
      }
      publierEtat()
      if (vocaux.delete(p.id)) lePanneau()?.webContents.send('tour-fini')
    })
  publierEtat()
}

const HALLUCINATIONS = [
  /sous-titr/i, /amara\.org/i, /merci d'avoir regard/i, /abonnez-vous/i, /^\W*(musique|rires?)\W*$/i, /^\W*$/
]

/** La transcription du mode Parler, chez Groq (Whisper large v3 turbo) : la clé reste dans le main. */
async function transcrire(audio: ArrayBuffer): Promise<{ texte?: string; erreur?: string }> {
  const cle = reglages.cleGroq()
  if (!cle) return { erreur: 'Il manque la clé Groq : ajoute-la dans les réglages (⚙).' }
  const corps = new FormData()
  corps.append('file', new Blob([audio], { type: 'audio/webm' }), 'question.webm')
  corps.append('model', 'whisper-large-v3-turbo')
  corps.append('language', 'fr')
  corps.append('temperature', '0')
  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}` },
      body: corps,
      signal: AbortSignal.timeout(30000)
    })
    if (res.status === 401) return { erreur: 'Clé Groq refusée : change-la dans les réglages (⚙).' }
    if (res.status === 429) return { erreur: 'Quota Groq atteint, réessaie dans un instant.' }
    if (!res.ok) return { erreur: `Transcription impossible (erreur ${res.status}).` }
    const texte = String(((await res.json()) as { text?: string }).text ?? '').trim()
    // Sur un souffle ou un bruit, Whisper invente des génériques de vidéo.
    if (HALLUCINATIONS.some((h) => h.test(texte))) {
      journal(`transcription ignorée : « ${texte.slice(0, 80)} »`)
      return { texte: '' }
    }
    return { texte }
  } catch (e) {
    journal(`transcription : ${String(e)}`)
    return { erreur: 'Transcription impossible : pas de réseau ?' }
  }
}

const dossierAssets = (): string => (app.isPackaged ? join(process.resourcesPath, 'assets') : join(__dirname, '../../assets'))

function brancher(): void {
  ipcMain.handle('etat', () => etat())
  ipcMain.handle('humeur', () => humeur)
  ipcMain.handle('fil', (_e, id: string) => fils.fil(id))

  ipcMain.on('envoyer', (_e, texte: string, pieces: PieceJointe[] = [], voix = false, citations?: Cite[]) =>
    envoyer(texte, pieces, voix, undefined, Array.isArray(citations) ? citations : undefined)
  )
  // Le panneau s'ouvre : les limites lues il y a plus d'une minute sont relues (hors tour, le tour les donne seul).
  ipcMain.on('limites', () => {
    const p = projets.actif()
    const l = agent.limitesConnues()
    if (!p || agent.enCours() || (l && Date.now() - l.lu < 60000)) return
    void agent.lireLimites(p).then(publierEtat)
  })
  ipcMain.on('arreter', () => {
    const p = projets.actifId()
    if (p) agent.arreter(p)
  })
  ipcMain.on('repondre', (_e, id: string, r: Reponse) => agent.repondre(id, r))
  ipcMain.handle('commandes', () => {
    const p = projets.actif()
    return p ? agent.commandes(p) : []
  })

  ipcMain.on('mode', (_e, mode: Mode) => {
    const p = projets.actif()
    if (!p) return
    projets.modifier(p.id, { mode })
    void agent.changerMode(p.id, mode)
    publierEtat()
  })
  ipcMain.on('nouvelle', () => {
    const p = projets.actif()
    if (p && !agent.enCours(p.id)) {
      projets.modifier(p.id, { session: null })
      fils.vider(p.id)
    }
    publierEtat()
  })
  ipcMain.on('ajouter-projet', () => void ajouterProjet())

  // Le hub : ouvrir un projet, ou le retirer (menu natif sur la carte).
  // Changer de projet ne coupe rien : les tours en cours continuent derrière.
  ipcMain.on('choisir-projet', (_e, id: string) => {
    if (projets.trouver(id)?.libre && !agent.enCours(id)) viderLibre()
    projets.choisir(id)
    publierEtat()
  })
  // « Nouveau projet » du hub : même chemin que l'outil creer_projet du chat
  // (Documents/Encre/Projets/<nom> + un CLAUDE.md qui porte le contexte).
  ipcMain.handle('creer-projet', (_e, nom: string, contexte: string) => {
    if (!nom.trim()) return null
    const p = projets.creer(nom.trim(), contexte.trim() || `Projet ${nom.trim()}.`)
    projets.choisir(p.id)
    publierEtat()
    return p.id
  })
  // Un sujet dans le projet ouvert : conversation neuve, même dossier et mêmes outils.
  ipcMain.handle('creer-sujet', (_e, parent: string, nom: string) => {
    const s = projets.creerSujet(parent, nom)
    publierEtat()
    return s?.id ?? null
  })
  ipcMain.on('ranger', (_e, id: string) => {
    if (!agent.rangerMaintenant(id)) journal(`rangement de ${projets.trouver(id)?.nom ?? id} : rien à ranger`)
  })
  ipcMain.on('menu-carte', (_e, id: string) => {
    const p = lePanneau(), pr = projets.trouver(id)
    if (!p || !pr || pr.libre) return
    Menu.buildFromTemplate([
      { label: 'Ouvrir le dossier', click: () => void shell.openPath(pr.dossier) },
      { type: 'separator' },
      {
        label: pr.parent ? 'Fermer ce sujet' : 'Retirer d’Encre (le dossier reste)',
        enabled: !agent.enCours(id),
        click: () => {
          for (const s of projets.sujetsDe(id)) fils.vider(s.id)
          projets.retirer(id)
          outils.oublierJetons(id)
          fils.vider(id)
          publierEtat()
        }
      }
    ]).popup({ window: p })
  })

  // Réglages : la clé Groq ne repart jamais vers le panneau, seulement sa présence.
  ipcMain.on('reglages', (_e, champs: Partial<Reglages>) => {
    const { cleGroq: _ignore, cleGemini: _ignore2, cleEleven: _ignore3, ...reste } = champs
    const r = reglages.modifier(reste)
    if ('demarrage' in reste) appliquerDemarrage(r)
    if ('voix' in reste) void prechaufferAttentes({ voix: r.voix, dossier: '' })
    publierEtat()
  })
  // La clé Gemini : enregistrée, Tako passe à une voix Gemini ; retirée, il revient à Edge.
  ipcMain.handle('cle-gemini', async (_e, cle: string | null) => {
    try {
      // Le format des clés Google change (pas toujours « AIza… ») : on demande
      // directement à Google si la clé marche, plutôt que de deviner.
      if (cle) {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
          headers: { 'x-goog-api-key': cle },
          signal: AbortSignal.timeout(10000)
        }).catch(() => null)
        if (!res) return 'Impossible de joindre Google : vérifie ta connexion.'
        if (res.status === 400 || res.status === 401 || res.status === 403) return 'Google refuse cette clé : vérifie que tu l’as copiée en entier.'
        if (!res.ok) journal(`clé Gemini : vérification ${res.status}, enregistrée quand même`)
      }
      reglages.poserCleGemini(cle)
      const r = reglages.reglages()
      if (cle && !estGemini(r.voix)) reglages.modifier({ voix: VOIX_GEMINI[0].id })
      if (!cle && estGemini(r.voix)) reglages.modifier({ voix: VOIX[0].id })
      void prechaufferAttentes({ voix: reglages.reglages().voix, dossier: '' })
      publierEtat()
      return null
    } catch (e) {
      return String((e as Error).message)
    }
  })
  // La clé ElevenLabs : vérifiée en listant les voix du compte ; enregistrée,
  // Tako prend la première de ces voix (Lucas choisit ensuite dans la liste).
  ipcMain.handle('cle-eleven', async (_e, cle: string | null) => {
    try {
      let premiere: string | undefined
      if (cle) {
        const liste = await voixEleven(cle.trim())
        premiere = liste[0]?.id
        cle = cle.trim()
      }
      reglages.poserCleEleven(cle)
      const r = reglages.reglages()
      if (cle && premiere && !estEleven(r.voix)) reglages.modifier({ voix: premiere })
      if (!cle && estEleven(r.voix)) reglages.modifier({ voix: VOIX[0].id })
      publierEtat()
      return null
    } catch (e) {
      return String((e as Error).message)
    }
  })
  ipcMain.handle('voix-eleven', async (): Promise<{ voix: VoixEleven[]; erreur?: string }> => {
    // Vérification sans clé : une liste aussi longue que celle d'un vrai compte.
    if (process.env.ENCRE_VERIF_VOIX) {
      const noms = ['Rachel', 'Adam', 'Bella', 'Josh', 'Charlotte', 'George', 'Lily', 'Daniel', 'Sarah', 'Brian', 'Alice', 'Bill', 'Jessica', 'Eric', 'Laura', 'Liam', 'Matilda', 'Will', 'River', 'Chris']
      return {
        voix: [
          { id: 'eleven:moi1', nom: 'Ma voix douce', aide: 'Ma voix', perso: true },
          { id: 'eleven:moi2', nom: 'Narratrice', aide: 'Créée', perso: true },
          ...noms.map((n, i) => ({ id: `eleven:${n}`, nom: n, aide: i % 2 ? 'Homme · grave' : 'Femme · calme', perso: false }))
        ]
      }
    }
    try {
      return { voix: await voixEleven() }
    } catch (e) {
      return { voix: [], erreur: String((e as Error).message) }
    }
  })
  // « Tester » dans les réglages : une phrase de Tako avec la voix choisie, rendue en base64.
  // Gardée en mémoire par voix : réécouter ne coûte pas une requête du quota Gemini.
  const essais = new Map<string, string>()
  ipcMain.handle('essai-voix', async (_e, voix: string): Promise<{ son?: string; erreur?: string }> => {
    // Le modèle ElevenLabs change le rendu : un essai par voix et par modèle.
    const cle = voix.startsWith('eleven:') ? `${voix}|${reglages.reglages().modeleEleven}` : voix
    const deja = essais.get(cle)
    if (deja) return { son: deja }
    try {
      const son = (await synthetiser('Salut, moi c’est Tako ! Dis-moi sur quoi on bosse, et je m’y mets tout de suite.', { voix, dossier: '' }, { secours: false })).toString('base64')
      essais.set(cle, son)
      return { son }
    } catch (e) {
      journal(`essai de voix : ${String(e)}`)
      if (e instanceof QuotaGemini) return { erreur: e.pourLucas }
      if (e instanceof QuotaEleven) return { erreur: 'Plus de crédits ElevenLabs ce mois-ci.' }
      return { erreur: 'La voix n’a pas répondu. Réessaie dans un instant.' }
    }
  })
  // « Créer la voix de Tako » : une description → une voix Gemini sur mesure, choisie aussitôt.
  ipcMain.handle('creer-voix', async (_e, description: string): Promise<{ son?: string; erreur?: string }> => {
    try {
      const nombre = reglages.reglages().voixPerso.length + 1
      const nom = nombre === 1 ? 'Tako' : `Tako ${nombre}`
      const { id, echantillon } = await creerVoix(description.trim(), nom)
      const v = { id, nom, description: description.trim(), creee: Date.now() }
      reglages.modifier({ voixPerso: [v, ...reglages.reglages().voixPerso], voix: `gemini:${id}` })
      journal(`voix créée : ${id}`)
      publierEtat()
      return { son: echantillon ?? undefined }
    } catch (e) {
      if (e instanceof QuotaGemini) return { erreur: e.pourLucas }
      return { erreur: String((e as Error).message ?? e) }
    }
  })
  ipcMain.on('oublier-voix', (_e, id: string) => {
    const r = reglages.reglages()
    reglages.modifier({ voixPerso: r.voixPerso.filter((v) => v.id !== id), ...(r.voix === `gemini:${id}` ? { voix: VOIX_GEMINI[0].id } : {}) })
    publierEtat()
  })
  ipcMain.handle('cle-groq', (_e, cle: string | null) => {
    try {
      reglages.poserCleGroq(cle)
      publierEtat()
      return null
    } catch (e) {
      return String((e as Error).message)
    }
  })

  // Mode Parler.
  ipcMain.handle('transcrire', (_e, audio: ArrayBuffer) => transcrire(audio))
  ipcMain.handle('modele-veille', () => {
    try {
      return readFileSync(join(dossierAssets(), 'veille', 'vosk-fr.tar.gz'))
    } catch {
      // Modèle absent : la veille se tait, le bouton micro reste.
      return null
    }
  })
  // La veille a entendu « Encre » : Encre écoute, mains libres (l'écoute se ferme sur un silence).
  ipcMain.on('veille-mot', () => {
    journal('veille : « Tako » entendu')
    dicter(true)
  })
  // Pendant un échange à la voix, Échap l'annule de partout, comme dans VoiceType :
  // le panneau, souvent caché, ne reçoit pas les touches.
  ipcMain.on('echange', (_e, oui: boolean) => {
    if (oui && !globalShortcut.isRegistered('Escape')) globalShortcut.register('Escape', () => lePanneau()?.webContents.send('annuler-dictee'))
    if (!oui && globalShortcut.isRegistered('Escape')) globalShortcut.unregister('Escape')
  })
  ipcMain.on('ecoute', (_e, oui: boolean) => {
    if (oui) changerHumeur('ecoute')
    else if (humeur === 'ecoute') changerHumeur('repos')
  })
  ipcMain.on('noter', (_e, ligne: string) => journal(`panneau : ${String(ligne).slice(0, 300)}`))

  // Outils du projet.
  ipcMain.handle('comptes-figma', () => outils.comptesFigma())
  ipcMain.handle('serveurs-dossier', (_e, id: string) => {
    const p = projets.trouver(id)
    return p ? outils.serveursDuDossier(p.dossier) : []
  })
  ipcMain.on('projet-figma', (_e, id: string, serveurs: string[]) => {
    projets.modifier(id, { figma: serveurs })
    publierEtat()
  })
  ipcMain.handle('jeton', (_e, id: string, nom: string, valeur: string | null) => {
    const p = projets.trouver(id)
    if (!p) return 'Projet introuvable.'
    try {
      projets.modifier(id, { jetons: outils.poserJeton(p, nom, valeur) })
      publierEtat()
      return null
    } catch (e) {
      return String((e as Error).message)
    }
  })
  ipcMain.handle('relier-figma', (_e, nom: string) => outils.relierFigma(nom))
  // Les outils de Claude Code (Notion, Linear…) : leur état, et une console pour les connecter.
  ipcMain.handle('outils-machine', (_e, id: string) => {
    const p = projets.trouver(id)
    return p ? outils.outilsMachine(projets.racineDe(p).dossier) : []
  })
  ipcMain.handle('catalogue-outils', () => outils.CATALOGUE)
  ipcMain.handle('connecter-outil', (_e, id: string, nom: string, url?: string) => {
    const p = projets.trouver(id)
    return outils.connecterOutil(nom, p ? projets.racineDe(p).dossier : projets.racine(), url)
  })

  // Comptes Claude. Changer de compte ne coupe pas les tours en cours : ils
  // finissent sur l'ancien, les suivants partent sur le nouveau.
  ipcMain.on('installer-maj', () => void updates.installer())
  ipcMain.on('compte-choisir', (_e, id: string) => {
    if (!comptes.choisir(id)) return
    noterConnexion(true)
    agent.oublierLimites()
    publierEtat()
    // L'autre compte a peut-être un autre avatar : la bulle le relit au chargement.
    laBulle()?.webContents.reload()
    const p = projets.actif()
    if (p && comptes.comptes().find((c) => c.actif)?.connecte) void agent.lireLimites(p).then(publierEtat)
  })
  // Ajouter puis connecter : la fenêtre de connexion s'ouvre, la réponse dit si ça a marché.
  ipcMain.handle('compte-ajouter', (_e, nom: string) => {
    const id = comptes.ajouter(nom)
    publierEtat()
    return id
  })
  ipcMain.handle('compte-connecter', async (_e, id: string) => {
    const erreur = await comptes.connecter(id)
    if (!erreur && comptes.actif() === id) {
      noterConnexion(true)
      agent.oublierLimites()
    }
    publierEtat()
    return erreur
  })
  ipcMain.on('compte-avatar', (_e, id: string, avatar: string) => {
    comptes.choisirAvatar(id, avatar)
    publierEtat()
    if (comptes.actif() === id) laBulle()?.webContents.reload()
  })
  ipcMain.on('compte-retirer', (_e, id: string) => {
    const etaitActif = comptes.actif() === id
    comptes.retirer(id)
    if (etaitActif) agent.oublierLimites()
    publierEtat()
  })

  ipcMain.on('fermer-panneau', () => fermerPanneau())
  ipcMain.on('fermer-fini', () => cacherPanneau())
  ipcMain.on('plein-ecran', () => basculerPlein())

  // Bulle : clic = panneau, glisser = déplacer, clic droit = menu.
  ipcMain.on('bulle-clic', () => basculerPanneau())
  ipcMain.on('bulle-deplacer', (_e, dx: number, dy: number) => deplacerBulle(dx, dy))
  ipcMain.on('bulle-lacher', () => rangerBulle())
  ipcMain.on('bulle-menu', () => {
    const b = laBulle()
    if (!b) return
    Menu.buildFromTemplate([
      { label: 'Ouvrir Encre', click: () => ouvrirPanneau() },
      {
        label: `Parler (${toucheParler})`,
        click: () => dicter(false)
      },
      { label: `Ouvrir : ${raccourci}`, enabled: false },
      ...(majPrete
        ? [{ label: `Installer la version ${majPrete}`, click: () => void updates.installer() } as Electron.MenuItemConstructorOptions]
        : []),
      { type: 'separator' },
      { label: 'Quitter', click: () => app.quit() }
    ]).popup({ window: b })
  })
}

void app.whenReady().then(() => {
  journal(`démarrage ${app.getVersion()}`)
  reprendrePathDuShell()
  // Sur macOS, sans menu, Cmd+C, Cmd+V et Cmd+A ne marchent plus dans la
  // saisie : le menu (invisible, le Dock est caché) porte ces raccourcis.
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
      : null
  )
  // Tako vit dans la bulle et près de l'horloge : pas d'icône dans le Dock.
  app.dock?.hide()
  brancher()
  viderLibre()
  if (process.env.ENCRE_ICONE) return void icone(process.env.ENCRE_ICONE)
  creerBulle()
  creerPanneau()
  poserIcone()
  // Gemini muet (quota) : le panneau le dit, la réponse reste écrite.
  quandMuet((s) => lePanneau()?.webContents.send('voix-muette', s))
  // Encre range une session : Tako écrit ses notes dans la bulle.
  agent.quandRange((id, oui) => humeurDe(id, oui ? 'note' : 'repos'))
  const libre = RACCOURCIS.find(([acc]) => globalShortcut.register(acc, () => basculerPanneau()))
  raccourci = libre?.[1] ?? 'aucun'
  const parler = RACCOURCIS_PARLER.find(([acc]) => globalShortcut.register(acc, () => dicter(false)))
  toucheParler = parler?.[1] ?? 'aucun'
  journal(`raccourcis : ${raccourci}, parler ${toucheParler}`)
  const r = reglages.reglages()
  appliquerDemarrage(r)
  // Les phrases d'attente du mode Parler, prêtes avant qu'on en ait besoin.
  void prechaufferAttentes({ voix: r.voix, dossier: '' })
  updates.surveiller((v) => {
    majPrete = v
    menuNotif()
    publierEtat()
  })
  if (process.env.ENCRE_VERIF) void verifier(process.env.ENCRE_VERIF)
})

/**
 * `ENCRE_ICONE=<fichier.png>` : dessine le poulpe en 512 px sur un disque et
 * l'enregistre, pour l'icône de l'app et de l'installeur. Puis quitte.
 */
async function icone(sortie: string): Promise<void> {
  const { BrowserWindow } = await import('electron')
  const { writeFileSync } = await import('fs')
  const f = new BrowserWindow({
    width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true,
    webPreferences: { offscreen: true, preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  const url = process.env.ELECTRON_RENDERER_URL
  const avatar = process.env.ENCRE_ICONE_AVATAR ?? 'tako'
  // ENCRE_ICONE_HUMEUR + ENCRE_ICONE_IMAGES=n : n images d'une humeur, pour voir une animation sans écran.
  const humeur = process.env.ENCRE_ICONE_HUMEUR ?? ''
  if (url) await f.loadURL(`${url}?vue=icone&avatar=${avatar}&humeur=${humeur}`)
  else await f.loadFile(join(__dirname, '../renderer/index.html'), { query: { vue: 'icone', avatar, humeur } })
  await new Promise((r) => setTimeout(r, 2500))
  const images = Number(process.env.ENCRE_ICONE_IMAGES) || 1
  for (let n = 0; n < images; n++) {
    if (n) await new Promise((r) => setTimeout(r, 450))
    writeFileSync(images > 1 ? sortie.replace(/\.png$/, `-${n}.png`) : sortie, (await f.webContents.capturePage()).toPNG())
  }
  journal(`icône enregistrée : ${sortie}`)
  app.quit()
}

/**
 * Vérification sans écran : `ENCRE_VERIF=<dossier> ENCRE_VERIF_SORTIE=<dossier>`
 * ajoute le projet, ouvre le panneau, envoie un vrai message à Claude et
 * enregistre une capture de la bulle et du panneau, puis quitte.
 * `ENCRE_VERIF_ETAPES=sans-claude` s'arrête avant le message (captures de l'interface seules).
 */
async function verifier(dossier: string): Promise<void> {
  const sortie = process.env.ENCRE_VERIF_SORTIE ?? dossier
  const attendre = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const { writeFileSync } = await import('fs')
  const capturer = async (nom: string): Promise<void> => {
    for (const [f, n] of [[laBulle(), 'bulle'], [lePanneau(), 'panneau']] as const) {
      // Une fenêtre cachée (la bulle, en plein écran) ne se capture pas : capturePage ne rendrait jamais la main.
      if (f?.isVisible()) writeFileSync(join(sortie, `${nom}-${n}.png`), (await f.webContents.capturePage()).toPNG())
    }
  }
  const js = (code: string): Promise<unknown> | undefined => lePanneau()?.webContents.executeJavaScript(code)
  // La connexion d'un autre compte : la fenêtre vierge doit s'ouvrir sur la page de Claude (personne pour s'y connecter).
  if (process.env.ENCRE_VERIF_CONNEXION) {
    const id = comptes.ajouter('Essai')
    void comptes.connecter(id).then((e) => journal(`verif connexion : ${e ?? 'connecté'}`))
    await attendre(9000)
    const f = BrowserWindow.getAllWindows().find((w) => w.getTitle() !== 'Encre' && w !== laBulle() && w !== lePanneau())
    journal(`verif connexion : fenêtre ${f ? f.webContents.getURL().slice(0, 120) : 'absente'}`)
    if (f) writeFileSync(join(sortie, 'c-connexion.png'), (await f.webContents.capturePage()).toPNG())
    f?.close()
    await attendre(5000)
    comptes.retirer(id)
    return app.quit()
  }
  if (process.env.ENCRE_VERIF_VOIX) {
    reglages.poserCleEleven('verif')
    reglages.modifier({ voix: 'eleven:Josh' })
  }
  const p = projets.ajouter(dossier)
  projets.modifier(p.id, { mode: (process.env.ENCRE_VERIF_MODE as Mode) || 'demander', session: null })
  // ENCRE_VERIF_MD=<fichier .md> : une réponse d'exemple dans le fil, capturée
  // en panneau puis en plein écran (rendu des titres, cases, tableaux, images).
  if (process.env.ENCRE_VERIF_MD) {
    const { readFileSync } = await import('fs')
    projets.choisir(p.id)
    fils.noter(p.id, { type: 'moi', texte: 'Montre-moi le plan.' } as Evenement)
    fils.noter(p.id, { type: 'texte', texte: readFileSync(process.env.ENCRE_VERIF_MD, 'utf-8') } as Evenement)
    fils.noter(p.id, { type: 'fin', duree: 6000, fil: 150_000, cout: 40_000, modele: 'Opus 5.5' } as Evenement)
    projets.creerSujet(p.id, 'Ticket 142')
    projets.creerSujet(p.id, 'Page tarifs')
    projets.choisir(p.id)
    if (process.env.ENCRE_VERIF_POLICE) reglages.modifier({ police: process.env.ENCRE_VERIF_POLICE as Reglages['police'] })
    await attendre(2500)
    ouvrirPanneau()
    publierEtat()
    await attendre(3000)
    await capturer('8-markdown')
    await js(`document.querySelector('.fil')?.scrollTo(0, 99999)`)
    await attendre(500)
    await capturer('8-markdown-bas')
    // ENCRE_VERIF_CITER=1 : deux réponses à des passages, puis un message neutre (rien n'est envoyé).
    if (process.env.ENCRE_VERIF_CITER) {
      const f = lePanneau()?.webContents
      const repondreA = async (n: number, reponse: string, nom: string): Promise<void> => {
        await js(`(() => {
          const el = [...document.querySelectorAll('.ia p, .ia li')][${n}]
          if (!el) return
          const r = document.createRange(); r.selectNodeContents(el)
          const s = getSelection(); s.removeAllRanges(); s.addRange(r)
          document.querySelector('.fil').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        })()`)
        await attendre(400)
        await js(`document.querySelector('.repondre-a')?.click()`)
        await attendre(500)
        f?.insertText(reponse)
        await attendre(300)
        await capturer(nom)
        await js(`document.querySelector('.bulle-reponse .ajouter')?.click()`)
        await attendre(500)
      }
      await js(`document.querySelector('.fil')?.scrollTo(0, 0)`)
      await repondreA(0, 'Oui, on part là-dessus.', '9-citer-bulle')
      await repondreA(2, 'Plutôt la deuxième option.', '9-citer-bulle-2')
      await js(`document.querySelector('.saisie textarea')?.focus()`)
      f?.insertText('Et pense à prévenir le client.')
      await attendre(400)
      await capturer('9-citer-pile')
      return app.quit()
    }
    await js(`document.querySelector('[data-action=plein]')?.click()`)
    await attendre(2000)
    await capturer('8-markdown-plein')
    return app.quit()
  }
  await attendre(2500)
  ouvrirPanneau()
  publierEtat()
  await attendre(1500)
  await js(`document.querySelector('.projet')?.click()`)
  await attendre(900)
  await capturer('0-hub')
  // La croix en plein écran doit ramener la bulle.
  if (process.env.ENCRE_VERIF_PLEIN) {
    const etatFenetres = (q: string): void => journal(`verif ${q} : panneau ${lePanneau()?.isVisible()} ${JSON.stringify(lePanneau()?.getBounds())}, bulle ${laBulle()?.isVisible()}`)
    await js(`document.querySelector('[data-action=plein]')?.click()`)
    await attendre(1200)
    etatFenetres('plein')
    lePanneau()?.blur()
    await attendre(600)
    etatFenetres('plein, passé derrière')
    basculerPanneau()
    await attendre(600)
    etatFenetres('plein, bulle cliquée')
    await js(`[...document.querySelectorAll('header .icone')].find((b) => b.title.startsWith('Fermer'))?.click()`)
    await attendre(1500)
    etatFenetres('après la croix')
    return app.quit()
  }
  // Les animations, image par image : l'encre qui s'étale, puis le clic sur la bulle.
  if (process.env.ENCRE_VERIF_ANIM) {
    await js(`document.querySelector('.projet')?.click()`)
    await attendre(500)
    fermerPanneau()
    await attendre(120)
    if (lePanneau()) writeFileSync(join(sortie, 'a0-fermeture.png'), (await lePanneau()!.webContents.capturePage()).toPNG())
    await attendre(800)
    ouvrirPanneau()
    for (const t of [140, 260, 420, 900]) {
      await attendre(t === 140 ? 140 : t - [140, 260, 420, 900][[140, 260, 420, 900].indexOf(t) - 1])
      writeFileSync(join(sortie, `a1-ouverture-${t}.png`), (await lePanneau()!.webContents.capturePage()).toPNG())
    }
    const b = laBulle()!
    await b.webContents.executeJavaScript(`(() => { const el = document.querySelector('.bulle'); const o = { bubbles: true, button: 0, pointerId: 1, clientX: 60, clientY: 60, screenX: 60, screenY: 60 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); setTimeout(() => el.dispatchEvent(new PointerEvent('pointerup', o)), 80) })()`)
    for (const t of [60, 200, 380]) {
      await attendre(t === 60 ? 60 : t === 200 ? 140 : 180)
      writeFileSync(join(sortie, `a2-clic-${t}.png`), (await b.webContents.capturePage()).toPNG())
    }
    journal('verif terminée (animations)')
    return app.quit()
  }
  await js(`document.querySelector('[data-action=nouveau]')?.click()`)
  await attendre(700)
  await capturer('0b-nouveau')
  await js(`document.querySelector('.nouveau .btn:not(.pri)')?.click()`)
  await attendre(300)
  await js(`document.querySelector('.projet')?.click()`)
  await attendre(500)
  await capturer('1-vide')
  // La fiche des limites, comme au survol (pas de souris ici).
  await js(`document.querySelector('.jauges')?.classList.add('montre')`)
  await attendre(400)
  await capturer('1b-limites')
  await js(`document.querySelector('.jauges')?.classList.remove('montre')`)
  // Les vues ajoutées : réglages, outils, commandes.
  // Le menu ⋯ de l'en-tête.
  await js(`document.querySelector('.plus')?.click()`)
  await attendre(500)
  await capturer('3b-menu')
  await js(`document.querySelector('.plus')?.click()`)
  for (const [nom, sel] of [['4-reglages', '[data-vue=reglages]'], ['5-outils', '[data-vue=outils]']]) {
    await js(`document.querySelector('${sel}')?.click()`)
    await attendre(1200)
    await capturer(nom)
    // Les onglets des réglages.
    for (const n of nom === '4-reglages' ? [2, 3] : []) {
      await js(`document.querySelector('.onglets button:nth-child(${n})')?.click()`)
      await attendre(700)
      await capturer(`${nom}-${n}`)
    }
    await js(`document.querySelector('${sel}')?.click()`)
    await attendre(400)
  }
  await js(`(() => { const t = document.querySelector('textarea'); const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(t, '/'); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await attendre(8000)
  await capturer('7-commandes')
  // La conversation à la voix (le vrai micro s'ouvre), puis le plein écran.
  await js(`(() => { const t = document.querySelector('textarea'); const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await attendre(300)
  await js(`document.querySelector('[data-action=parler]')?.click()`)
  await attendre(1800)
  await capturer('6-appel')
  await js(`document.querySelector('.appel .annuler')?.click()`)
  await attendre(400)
  await js(`document.querySelector('[data-action=plein]')?.click()`)
  await attendre(1500)
  await capturer('8-plein')
  await js(`document.querySelector('[data-action=parler]')?.click()`)
  await attendre(1800)
  await capturer('9-plein-appel')
  await js(`document.querySelector('.appel .annuler')?.click()`)
  await js(`document.querySelector('[data-action=plein]')?.click()`)
  await attendre(800)
  await js(`(() => { const t = document.querySelector('textarea'); const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  // La chaîne du mode Parler, sans micro : la voix d'Edge dit une phrase, Groq la retranscrit.
  if (process.env.ENCRE_VERIF_ETAPES === 'sans-claude') {
    const { synthetiser } = await import('./voix')
    const phrase = 'Bonjour, je suis Tako, le poulpe d’Encre, et je teste ma voix.'
    try {
      const mp3 = await synthetiser(phrase, { voix: reglages.reglages().voix, dossier: '' })
      writeFileSync(join(sortie, 'voix.mp3'), mp3)
      const r = await transcrire(mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.byteLength) as ArrayBuffer)
      journal(`verif voix : ${mp3.length} octets, transcrit « ${r.texte ?? r.erreur} »`)
    } catch (e) {
      journal(`verif voix en erreur : ${String(e)}`)
    }
  }
  if (process.env.ENCRE_VERIF_ETAPES === 'sans-claude') {
    journal('verif terminée (sans Claude)')
    return app.quit()
  }
  // Le parcours Libre : une demande de travail doit créer un projet, y déménager et continuer.
  if (process.env.ENCRE_VERIF_LIBRE) {
    const libre = projets.projets().find((x) => x.libre)!
    viderLibre()
    projets.choisir(libre.id)
    publierEtat()
    await js(`document.querySelector('[data-vue=reglages]')?.click()`)
    await attendre(300)
    await js(`document.querySelector('[data-vue=reglages]')?.click()`)
    await attendre(800)
    await capturer('l0-libre')
    envoyer(process.env.ENCRE_VERIF_LIBRE, [], false)
    // Deux tours : celui de Libre, puis la relance dans le projet créé.
    let calme = 0
    while (calme < 6) {
      await attendre(1000)
      calme = agent.enCours() ? 0 : calme + 1
    }
    journal(`verif libre : actif ${projets.actif()?.nom}, fil libre ${fils.fil(libre.id).length} blocs, fil projet ${fils.fil(projets.actifId() ?? '').length} blocs`)
    await capturer('l1-projet')
    await js(`document.querySelector('[data-action=plein]')?.click()`)
    await attendre(1500)
    await capturer('l2-plein')
    journal('verif terminée')
    return app.quit()
  }
  const message = process.env.ENCRE_VERIF_MESSAGE ?? 'Crée un fichier bonjour.txt qui contient « Bonjour », puis dis-moi en une phrase ce que tu as fait.'
  let demande = false
  const actif = projets.actif()!
  diffuser(actif.id, { type: 'moi', texte: message })
  const fin = agent.envoyer(actif, message, {
    evenement: (ev) => {
      diffuser(actif.id, ev)
      journal(`verif ${ev.type} ${JSON.stringify(ev).slice(0, 300)}`)
      if (ev.type === 'demande' && !demande) {
        demande = true
        void attendre(1200).then(async () => {
          await capturer('2-demande')
          // ENCRE_VERIF_DELAI : répondre tard, comme un humain qui lit la demande.
          await attendre(Number(process.env.ENCRE_VERIF_DELAI ?? 0))
          agent.repondre(ev.demande.id, 'oui')
        })
      }
    },
    humeur: (h) => humeurDe(actif.id, h),
    projets: publierEtat
  })
  publierEtat()
  await fin
  // ENCRE_VERIF_SUITE : un second message. Avec ENCRE_RANGER_APRES court, la
  // session est rangée entre les deux et le second repart des notes.
  if (process.env.ENCRE_VERIF_SUITE) {
    await attendre((Number(process.env.ENCRE_RANGER_APRES) || 0) + 500)
    const suite = process.env.ENCRE_VERIF_SUITE
    diffuser(actif.id, { type: 'moi', texte: suite })
    await agent.envoyer(projets.trouver(actif.id) ?? actif, suite, {
      evenement: (ev) => {
        diffuser(actif.id, ev)
        journal(`verif suite ${ev.type} ${JSON.stringify(ev).slice(0, 300)}`)
        if (ev.type === 'demande') agent.repondre(ev.demande.id, 'oui')
      },
      humeur: (h) => humeurDe(actif.id, h),
      projets: publierEtat
    })
  }
  fils.ecrire()
  publierEtat()
  await attendre(1500)
  await capturer('3-fin')
  journal('verif terminée')
  app.quit()
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  agent.arreter()
  fils.ecrire()
})
// Le panneau caché ne doit pas fermer l'app : seule la bulle (ou « Quitter ») le fait.
app.on('window-all-closed', () => app.quit())
