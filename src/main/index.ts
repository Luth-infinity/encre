import { app, dialog, globalShortcut, ipcMain, Menu } from 'electron'
import type { Etat, Humeur, Mode, Reponse } from '@shared/types'
import * as agent from './agent'
import { etatClaude } from './claude'
import {
  aTous, basculerPanneau, creerBulle, creerPanneau, deplacerBulle, laBulle, lePanneau, ouvrirPanneau, rangerBulle
} from './fenetres'
import { journal } from './journal'
import * as projets from './projets'

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
  ['Alt+Shift+E', 'Alt+Maj+E'],
  ['Control+Shift+E', 'Ctrl+Maj+E']
]
let raccourci = 'aucun'

let humeur: Humeur = 'repos'
let retourRepos: NodeJS.Timeout | null = null
function changerHumeur(h: Humeur): void {
  humeur = h
  if (retourRepos) clearTimeout(retourRepos)
  // « Fini » reste quelques secondes, le temps de le voir, puis il se repose.
  if (h === 'fini') retourRepos = setTimeout(() => changerHumeur('repos'), 6000)
  aTous('humeur', h)
}

function etat(): Etat {
  return { projets: projets.projets(), actif: projets.actifId(), claude: etatClaude(), enCours: agent.enCours() }
}
const publierEtat = (): void => lePanneau()?.webContents.send('etat', etat())

async function ajouterProjet(): Promise<void> {
  const p = lePanneau()
  const r = p
    ? await dialog.showOpenDialog(p, { title: 'Dossier du projet', properties: ['openDirectory'] })
    : await dialog.showOpenDialog({ title: 'Dossier du projet', properties: ['openDirectory'] })
  if (!r.canceled && r.filePaths[0]) projets.ajouter(r.filePaths[0])
  publierEtat()
}

function brancher(): void {
  ipcMain.handle('etat', () => etat())
  ipcMain.handle('humeur', () => humeur)

  ipcMain.on('envoyer', (_e, texte: string) => {
    const p = projets.actif()
    if (!p || agent.enCours()) return
    void agent
      .envoyer(p, texte, {
        evenement: (ev) => lePanneau()?.webContents.send('evenement', ev),
        humeur: changerHumeur
      })
      .then(publierEtat)
    publierEtat()
  })
  ipcMain.on('arreter', () => agent.arreter())
  ipcMain.on('repondre', (_e, id: string, r: Reponse) => agent.repondre(id, r))

  ipcMain.on('mode', (_e, mode: Mode) => {
    const p = projets.actif()
    if (!p) return
    projets.modifier(p.id, { mode })
    void agent.changerMode(mode)
    publierEtat()
  })
  ipcMain.on('nouvelle', () => {
    const p = projets.actif()
    if (p && !agent.enCours()) projets.modifier(p.id, { session: null })
    publierEtat()
  })
  ipcMain.on('ajouter-projet', () => void ajouterProjet())

  // Liste des projets : menu natif sous le nom du projet.
  ipcMain.on('menu-projets', (_e, x: number, y: number) => {
    const p = lePanneau()
    if (!p) return
    const actif = projets.actifId()
    Menu.buildFromTemplate([
      ...projets.projets().map((pr) => ({
        label: pr.nom,
        type: 'radio' as const,
        checked: pr.id === actif,
        enabled: !agent.enCours(),
        click: () => { projets.choisir(pr.id); publierEtat() }
      })),
      { type: 'separator' },
      { label: 'Ajouter un projet…', click: () => void ajouterProjet() },
      ...(actif
        ? [{ label: 'Retirer ce projet', enabled: !agent.enCours(), click: () => { projets.retirer(actif); publierEtat() } }]
        : [])
    ]).popup({ window: p, x: Math.round(x), y: Math.round(y) })
  })

  ipcMain.on('fermer-panneau', () => lePanneau()?.hide())

  // Bulle : clic = panneau, glisser = déplacer, clic droit = menu.
  ipcMain.on('bulle-clic', () => basculerPanneau())
  ipcMain.on('bulle-deplacer', (_e, dx: number, dy: number) => deplacerBulle(dx, dy))
  ipcMain.on('bulle-lacher', () => rangerBulle())
  ipcMain.on('bulle-menu', () => {
    const b = laBulle()
    if (!b) return
    Menu.buildFromTemplate([
      { label: 'Ouvrir Encre', click: () => ouvrirPanneau() },
      { label: `Raccourci : ${raccourci}`, enabled: false },
      { type: 'separator' },
      { label: 'Quitter', click: () => app.quit() }
    ]).popup({ window: b })
  })
}

void app.whenReady().then(() => {
  journal(`démarrage ${app.getVersion()}`)
  Menu.setApplicationMenu(null)
  brancher()
  creerBulle()
  creerPanneau()
  const libre = RACCOURCIS.find(([acc]) => globalShortcut.register(acc, () => basculerPanneau()))
  raccourci = libre?.[1] ?? 'aucun'
  journal(`raccourci : ${raccourci}`)
  if (process.env.ENCRE_VERIF) void verifier(process.env.ENCRE_VERIF)
})

/**
 * Vérification sans écran : `ENCRE_VERIF=<dossier> ENCRE_VERIF_SORTIE=<dossier>`
 * ajoute le projet, ouvre le panneau, envoie un vrai message à Claude et
 * enregistre une capture de la bulle et du panneau, puis quitte.
 */
async function verifier(dossier: string): Promise<void> {
  const sortie = process.env.ENCRE_VERIF_SORTIE ?? dossier
  const attendre = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const { writeFileSync } = await import('fs')
  const { join } = await import('path')
  const capturer = async (nom: string): Promise<void> => {
    for (const [f, n] of [[laBulle(), 'bulle'], [lePanneau(), 'panneau']] as const) {
      if (f) writeFileSync(join(sortie, `${nom}-${n}.png`), (await f.webContents.capturePage()).toPNG())
    }
  }
  const p = projets.ajouter(dossier)
  projets.modifier(p.id, { mode: (process.env.ENCRE_VERIF_MODE as Mode) || 'demander', session: null })
  await attendre(2500)
  ouvrirPanneau()
  publierEtat()
  await attendre(1500)
  await capturer('1-vide')
  const message = process.env.ENCRE_VERIF_MESSAGE ?? 'Crée un fichier bonjour.txt qui contient « Bonjour Lucas », puis dis-moi en une phrase ce que tu as fait.'
  let demande = false
  const fin = agent.envoyer(projets.actif()!, message, {
    evenement: (ev) => {
      lePanneau()?.webContents.send('evenement', ev)
      journal(`verif ${ev.type} ${JSON.stringify(ev).slice(0, 300)}`)
      if (ev.type === 'demande' && !demande) {
        demande = true
        void attendre(1200).then(async () => {
          await capturer('2-demande')
          agent.repondre(ev.demande.id, 'oui')
        })
      }
    },
    humeur: changerHumeur
  })
  publierEtat()
  await fin
  publierEtat()
  await attendre(1500)
  await capturer('3-fin')
  journal('verif terminée')
  app.quit()
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  agent.arreter()
})
// Le panneau caché ne doit pas fermer l'app : seule la bulle (ou « Quitter ») le fait.
app.on('window-all-closed', () => app.quit())
