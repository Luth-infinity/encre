import { contextBridge, ipcRenderer } from 'electron'
import type { Etat, Evenement, Humeur, Mode, Reponse } from '../shared/types'

function recevoir<T>(canal: string, cb: (v: T) => void): () => void {
  const h = (_e: unknown, v: T): void => cb(v)
  ipcRenderer.on(canal, h)
  return () => ipcRenderer.removeListener(canal, h)
}

const api = {
  etat: (): Promise<Etat> => ipcRenderer.invoke('etat'),
  surEtat: (cb: (e: Etat) => void) => recevoir('etat', cb),
  humeur: (): Promise<Humeur> => ipcRenderer.invoke('humeur'),
  surHumeur: (cb: (h: Humeur) => void) => recevoir('humeur', cb),
  surEvenement: (cb: (e: Evenement) => void) => recevoir('evenement', cb),
  surOuvert: (cb: () => void) => recevoir('ouvert', cb),

  envoyer: (texte: string) => ipcRenderer.send('envoyer', texte),
  arreter: () => ipcRenderer.send('arreter'),
  repondre: (id: string, r: Reponse) => ipcRenderer.send('repondre', id, r),
  mode: (m: Mode) => ipcRenderer.send('mode', m),
  nouvelle: () => ipcRenderer.send('nouvelle'),
  ajouterProjet: () => ipcRenderer.send('ajouter-projet'),
  choisirProjet: (id: string) => ipcRenderer.send('choisir-projet', id),
  menuCarte: (id: string) => ipcRenderer.send('menu-carte', id),
  fermer: () => ipcRenderer.send('fermer-panneau'),

  bulleClic: () => ipcRenderer.send('bulle-clic'),
  bulleDeplacer: (dx: number, dy: number) => ipcRenderer.send('bulle-deplacer', dx, dy),
  bulleLacher: () => ipcRenderer.send('bulle-lacher'),
  bulleMenu: () => ipcRenderer.send('bulle-menu')
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
