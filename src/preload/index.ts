import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Bloc, Commande, CompteFigma, Etat, Evenement, Humeur, Mode, PieceJointe, Reglages, Reponse
} from '../shared/types'

function recevoir<T extends unknown[]>(canal: string, cb: (...v: T) => void): () => void {
  const h = (_e: unknown, ...v: T): void => cb(...v)
  ipcRenderer.on(canal, h as never)
  return () => ipcRenderer.removeListener(canal, h as never)
}

const api = {
  etat: (): Promise<Etat> => ipcRenderer.invoke('etat'),
  surEtat: (cb: (e: Etat) => void) => recevoir('etat', cb),
  humeur: (): Promise<Humeur> => ipcRenderer.invoke('humeur'),
  surHumeur: (cb: (h: Humeur) => void) => recevoir('humeur', cb),
  /** Les événements d'un tour, avec le projet dont ils remplissent le fil. */
  surEvenement: (cb: (projet: string, e: Evenement) => void) => recevoir('evenement', cb),
  /** Le fil d'un projet a changé d'un bloc (conversation déménagée depuis Libre) : à relire en entier. */
  surFilChange: (cb: (projet: string) => void) => recevoir('fil-change', cb),
  surOuvert: (cb: (origine: { x: number; y: number }) => void) => recevoir('ouvert', cb),
  /** Le main veut fermer : le panneau joue sa sortie, puis appelle `fermerFini`. */
  surAFermer: (cb: (origine: { x: number; y: number }) => void) => recevoir('a-fermer', cb),
  fermerFini: () => ipcRenderer.send('fermer-fini'),
  surTourFini: (cb: () => void) => recevoir('tour-fini', cb),
  fil: (id: string): Promise<Bloc[]> => ipcRenderer.invoke('fil', id),

  envoyer: (texte: string, pieces: PieceJointe[] = [], voix = false) => ipcRenderer.send('envoyer', texte, pieces, voix),
  arreter: () => ipcRenderer.send('arreter'),
  repondre: (id: string, r: Reponse) => ipcRenderer.send('repondre', id, r),
  mode: (m: Mode) => ipcRenderer.send('mode', m),
  nouvelle: () => ipcRenderer.send('nouvelle'),
  commandes: (): Promise<Commande[]> => ipcRenderer.invoke('commandes'),
  ajouterProjet: () => ipcRenderer.send('ajouter-projet'),
  choisirProjet: (id: string) => ipcRenderer.send('choisir-projet', id),
  creerProjet: (nom: string, contexte: string): Promise<string | null> => ipcRenderer.invoke('creer-projet', nom, contexte),
  menuCarte: (id: string) => ipcRenderer.send('menu-carte', id),
  fermer: () => ipcRenderer.send('fermer-panneau'),
  /** Le panneau prend tout l'écran, ou revient contre la bulle. */
  pleinEcran: () => ipcRenderer.send('plein-ecran'),
  surPlein: (cb: (plein: boolean) => void) => recevoir('plein', cb),
  /** Le chemin d'un fichier glissé dans le panneau (Electron a retiré `File.path`). */
  cheminFichier: (f: File): string => webUtils.getPathForFile(f),

  reglages: (champs: Partial<Reglages>) => ipcRenderer.send('reglages', champs),
  cleGroq: (cle: string | null): Promise<string | null> => ipcRenderer.invoke('cle-groq', cle),
  cleGemini: (cle: string | null): Promise<string | null> => ipcRenderer.invoke('cle-gemini', cle),
  /** Une phrase de Tako dans la voix donnée, en base64 (MP3 ou WAV). */
  essaiVoix: (voix: string): Promise<{ son?: string; erreur?: string }> => ipcRenderer.invoke('essai-voix', voix),

  // Mode Parler.
  transcrire: (audio: ArrayBuffer): Promise<{ texte?: string; erreur?: string }> => ipcRenderer.invoke('transcrire', audio),
  surAudio: (cb: (mp3: string) => void) => recevoir('audio', cb),
  /** Le raccourci pour parler (ou le mot « Encre », mains libres) : ouvrir l'écoute, ou envoyer. */
  surDicter: (cb: (mainsLibres: boolean) => void) => recevoir('dicter', cb),
  surAnnulerDictee: (cb: () => void) => recevoir('annuler-dictee', cb),
  /** Un échange à la voix commence ou finit : Échap devient global le temps qu'il dure. */
  echange: (oui: boolean) => ipcRenderer.send('echange', oui),
  modeleVeille: (): Promise<Uint8Array | null> => ipcRenderer.invoke('modele-veille'),
  veilleMot: () => ipcRenderer.send('veille-mot'),
  /** Le micro est ouvert : le poulpe de la bulle prend l'humeur « écoute ». */
  ecoute: (oui: boolean) => ipcRenderer.send('ecoute', oui),
  noter: (ligne: string) => ipcRenderer.send('noter', ligne),

  // Outils du projet.
  comptesFigma: (): Promise<CompteFigma[]> => ipcRenderer.invoke('comptes-figma'),
  serveursDossier: (id: string): Promise<string[]> => ipcRenderer.invoke('serveurs-dossier', id),
  projetFigma: (id: string, serveurs: string[]) => ipcRenderer.send('projet-figma', id, serveurs),
  jeton: (id: string, nom: string, valeur: string | null): Promise<string | null> => ipcRenderer.invoke('jeton', id, nom, valeur),
  relierFigma: (nom: string): Promise<string | null> => ipcRenderer.invoke('relier-figma', nom),

  bulleClic: () => ipcRenderer.send('bulle-clic'),
  bulleDeplacer: (dx: number, dy: number) => ipcRenderer.send('bulle-deplacer', dx, dy),
  bulleLacher: () => ipcRenderer.send('bulle-lacher'),
  bulleMenu: () => ipcRenderer.send('bulle-menu')
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
