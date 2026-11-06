import './avant'
import { app, dialog, globalShortcut, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { Etat, Evenement, Humeur, Mode, PieceJointe, Reglages, Reponse } from '@shared/types'
import * as agent from './agent'
import { etatClaude } from './claude'
import {
  aTous, basculerPanneau, basculerPlein, cacherPanneau, creerBulle, fermerPanneau, creerPanneau, deplacerBulle, laBulle, lePanneau, ouvrirPanneau, rangerBulle
} from './fenetres'
import * as fils from './fils'
import { journal } from './journal'
import * as outils from './outils'
import * as projets from './projets'
import * as reglages from './reglages'
import * as updates from './updates'
import { attentePrete, prechaufferAttentes } from './voix'

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
  zoneNotif.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Ouvrir Tako', click: () => { laBulle()?.showInactive(); ouvrirPanneau() } },
      { label: 'Parler', click: () => dicter(false) },
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

/** Le projet du tour en cours : il peut changer d'actif en plein tour (projet créé depuis le chat). */
let tourDe: string | null = null

function etat(): Etat {
  return {
    projets: projets.projets(),
    actif: projets.actifId(),
    claude: etatClaude(),
    enCours: agent.enCours(),
    reglages: reglages.reglages(),
    version: app.getVersion(),
    tourDe,
    toucheParler
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
function envoyer(texte: string, pieces: PieceJointe[], voix: boolean, relance?: string): void {
  const p = projets.actif()
  if (!p || agent.enCours() || (!texte.trim() && !pieces.length)) return
  tourDe = p.id
  if (!relance) diffuser(p.id, { type: 'moi', texte, pieces: pieces.length ? pieces.map((x) => x.nom) : undefined, voix: voix || undefined })
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
  void agent
    .envoyer(
      p,
      relance ?? texte,
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
        humeur: changerHumeur,
        projets: publierEtat,
        audio
      },
      { pieces, voix: voix ? r.voix : undefined }
    )
    .then(() => {
      if (attente) clearTimeout(attente)
      tourDe = null
      fils.ecrire()
      // Depuis Libre, Tako a créé (ou ouvert) un projet : la conversation y
      // déménage, Libre repart à vide, et le travail commence là-bas tout de suite.
      const arrivee = projets.actif()
      if (p.libre && !relance && arrivee && arrivee.id !== p.id) {
        fils.deplacer(p.id, arrivee.id)
        projets.modifier(p.id, { session: null })
        publierEtat()
        lePanneau()?.webContents.send('fil-change', arrivee.id)
        const suite = `Ce projet vient d’être ouvert depuis Libre pour cette demande : « ${texte} ». Mets-toi au travail.`
        return void envoyer(texte, pieces, voix, suite)
      }
      publierEtat()
      lePanneau()?.webContents.send('tour-fini')
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

  ipcMain.on('envoyer', (_e, texte: string, pieces: PieceJointe[] = [], voix = false) => envoyer(texte, pieces, voix))
  ipcMain.on('arreter', () => agent.arreter())
  ipcMain.on('repondre', (_e, id: string, r: Reponse) => agent.repondre(id, r))
  ipcMain.handle('commandes', () => {
    const p = projets.actif()
    return p ? agent.commandes(p) : []
  })

  ipcMain.on('mode', (_e, mode: Mode) => {
    const p = projets.actif()
    if (!p) return
    projets.modifier(p.id, { mode })
    void agent.changerMode(mode)
    publierEtat()
  })
  ipcMain.on('nouvelle', () => {
    const p = projets.actif()
    if (p && !agent.enCours()) {
      projets.modifier(p.id, { session: null })
      fils.vider(p.id)
    }
    publierEtat()
  })
  ipcMain.on('ajouter-projet', () => void ajouterProjet())

  // Le hub : ouvrir un projet, ou le retirer (menu natif sur la carte).
  ipcMain.on('choisir-projet', (_e, id: string) => {
    if (agent.enCours()) return
    if (projets.trouver(id)?.libre) viderLibre()
    projets.choisir(id)
    publierEtat()
  })
  // « Nouveau projet » du hub : même chemin que l'outil creer_projet du chat
  // (Documents/Encre/Projets/<nom> + un CLAUDE.md qui porte le contexte).
  ipcMain.handle('creer-projet', (_e, nom: string, contexte: string) => {
    if (agent.enCours() || !nom.trim()) return null
    const p = projets.creer(nom.trim(), contexte.trim() || `Projet ${nom.trim()}.`)
    projets.choisir(p.id)
    publierEtat()
    return p.id
  })
  ipcMain.on('menu-carte', (_e, id: string) => {
    const p = lePanneau(), pr = projets.trouver(id)
    if (!p || !pr || pr.libre) return
    Menu.buildFromTemplate([
      { label: 'Ouvrir le dossier', click: () => void shell.openPath(pr.dossier) },
      { type: 'separator' },
      {
        label: 'Retirer d’Encre (le dossier reste)',
        enabled: !agent.enCours(),
        click: () => {
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
    const { cleGroq: _ignore, ...reste } = champs
    const r = reglages.modifier(reste)
    if ('demarrage' in reste) appliquerDemarrage(r)
    if ('voix' in reste) void prechaufferAttentes({ voix: r.voix, dossier: '' })
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
  Menu.setApplicationMenu(null)
  brancher()
  viderLibre()
  if (process.env.ENCRE_ICONE) return void icone(process.env.ENCRE_ICONE)
  creerBulle()
  creerPanneau()
  poserIcone()
  const libre = RACCOURCIS.find(([acc]) => globalShortcut.register(acc, () => basculerPanneau()))
  raccourci = libre?.[1] ?? 'aucun'
  const parler = RACCOURCIS_PARLER.find(([acc]) => globalShortcut.register(acc, () => dicter(false)))
  toucheParler = parler?.[1] ?? 'aucun'
  journal(`raccourcis : ${raccourci}, parler ${toucheParler}`)
  const r = reglages.reglages()
  appliquerDemarrage(r)
  // Les phrases d'attente du mode Parler, prêtes avant qu'on en ait besoin.
  void prechaufferAttentes({ voix: r.voix, dossier: '' })
  updates.surveiller((v) => (majPrete = v))
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
  if (url) await f.loadURL(`${url}?vue=icone`)
  else await f.loadFile(join(__dirname, '../renderer/index.html'), { query: { vue: 'icone' } })
  await new Promise((r) => setTimeout(r, 2500))
  writeFileSync(sortie, (await f.webContents.capturePage()).toPNG())
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
  const p = projets.ajouter(dossier)
  projets.modifier(p.id, { mode: (process.env.ENCRE_VERIF_MODE as Mode) || 'demander', session: null })
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
  // Les vues ajoutées : réglages, outils, commandes.
  for (const [nom, sel] of [['4-reglages', '[data-vue=reglages]'], ['5-outils', '[data-vue=outils]']]) {
    await js(`document.querySelector('${sel}')?.click()`)
    await attendre(1200)
    await capturer(nom)
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
      calme = agent.enCours() || tourDe ? 0 : calme + 1
    }
    journal(`verif libre : actif ${projets.actif()?.nom}, fil libre ${fils.fil(libre.id).length} blocs, fil projet ${fils.fil(projets.actifId() ?? '').length} blocs`)
    await capturer('l1-projet')
    await js(`document.querySelector('[data-action=plein]')?.click()`)
    await attendre(1500)
    await capturer('l2-plein')
    journal('verif terminée')
    return app.quit()
  }
  const message = process.env.ENCRE_VERIF_MESSAGE ?? 'Crée un fichier bonjour.txt qui contient « Bonjour Lucas », puis dis-moi en une phrase ce que tu as fait.'
  let demande = false
  const actif = projets.actif()!
  tourDe = actif.id
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
    humeur: changerHumeur,
    projets: publierEtat
  })
  publierEtat()
  await fin
  tourDe = null
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
