import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Bloc, Commande, CompteFigma, Etat, Evenement, Humeur, Mode, PieceJointe, Reglages, Reponse, VoixEleven
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

  /** Pendant un tour, le message s'y glisse. `citation` : le passage d'une réponse auquel on répond. */
  envoyer: (texte: string, pieces: PieceJointe[] = [], voix = false, citation?: string) =>
    ipcRenderer.send('envoyer', texte, pieces, voix, citation),
  /** Relire les limites du compte Claude (5 h, semaine) si elles datent : la réponse arrive par `etat`. */
  limites: () => ipcRenderer.send('limites'),
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
  cleEleven: (cle: string | null): Promise<string | null> => ipcRenderer.invoke('cle-eleven', cle),
  /** Les voix du compte ElevenLabs (lues en ligne à chaque ouverture de l'onglet Voix). */
  voixEleven: (): Promise<{ voix: VoixEleven[]; erreur?: string }> => ipcRenderer.invoke('voix-eleven'),
  /** Une phrase de Tako dans la voix donnée, en base64 (MP3 ou WAV). */
  essaiVoix: (voix: string): Promise<{ son?: string; erreur?: string }> => ipcRenderer.invoke('essai-voix', voix),
  /** Crée une voix Gemini sur mesure à partir d'une description ; rend l'échantillon. */
  creerVoix: (description: string): Promise<{ son?: string; erreur?: string }> => ipcRenderer.invoke('creer-voix', description),
  oublierVoix: (id: string) => ipcRenderer.send('oublier-voix', id),
  /** Gemini n'a pas pu parler (quota) : la réponse reste écrite ; `secondes` avant que ça se libère. */
  surVoixMuette: (cb: (secondes: number) => void) => recevoir('voix-muette', cb),

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
  /** Comptes Claude : choisir, en ajouter un (une console s'ouvre pour s'y connecter), reconnecter, retirer. */
  choisirCompte: (id: string) => ipcRenderer.send('compte-choisir', id),
  /** Installer la mise à jour prête : Encre se ferme et se rouvre dans la nouvelle version. */
  installerMaj: () => ipcRenderer.send('installer-maj'),
  ajouterCompte: (nom: string): Promise<string> => ipcRenderer.invoke('compte-ajouter', nom),
  /** Ouvre la fenêtre de connexion ; résout avec une erreur lisible, ou null si le compte est connecté. */
  connecterCompte: (id: string): Promise<string | null> => ipcRenderer.invoke('compte-connecter', id),
  retirerCompte: (id: string) => ipcRenderer.send('compte-retirer', id),
  /** L'avatar d'un compte (`AVATARS`) : apparence, nom et ton de la bulle. */
  choisirAvatar: (id: string, avatar: string) => ipcRenderer.send('compte-avatar', id, avatar),

  bulleClic: () => ipcRenderer.send('bulle-clic'),
  bulleDeplacer: (dx: number, dy: number) => ipcRenderer.send('bulle-deplacer', dx, dy),
  bulleLacher: () => ipcRenderer.send('bulle-lacher'),
  bulleMenu: () => ipcRenderer.send('bulle-menu')
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
