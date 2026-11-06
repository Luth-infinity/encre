import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { appliquer, type Bloc, type Evenement } from '@shared/types'

/**
 * Le fil de chaque projet, gardé sur le disque : rouvrir Encre (ou le
 * panneau rechargé) remontre la conversation, pas seulement la session de
 * Claude qui reprend en silence. Un fichier par projet dans `userData/fils`.
 */

/** Au-delà, les plus anciens partent : le fil reste un écran, pas une archive. */
const MAX = 400

const cache = new Map<string, Bloc[]>()
const sales = new Set<string>()
let minuterie: NodeJS.Timeout | null = null

const dossier = (): string => join(app.getPath('userData'), 'fils')
const fichier = (id: string): string => join(dossier(), `${id.replace(/[^\w-]/g, '_')}.json`)

export function fil(id: string): Bloc[] {
  const deja = cache.get(id)
  if (deja) return deja
  let lu: Bloc[] = []
  try {
    if (existsSync(fichier(id))) lu = JSON.parse(readFileSync(fichier(id), 'utf-8')) as Bloc[]
  } catch {
    // Fichier abîmé : un fil vide vaut mieux qu'un panneau qui ne s'ouvre pas.
  }
  // Une demande d'autorisation enregistrée n'attend plus personne : le tour
  // qui la posait est fini depuis longtemps.
  lu = lu.filter((b) => b.type !== 'demande')
  cache.set(id, lu)
  return lu
}

export function noter(id: string, e: Evenement): void {
  // Les demandes vivent le temps du tour : inutile de réécrire le disque pour elles.
  const f = appliquer(fil(id), e)
  cache.set(id, f.length > MAX ? f.slice(f.length - MAX) : f)
  if (e.type === 'demande' || e.type === 'demande-close') return
  sales.add(id)
  // Le texte arrive mot à mot : on écrit par paquets, pas à chaque mot.
  minuterie ??= setTimeout(ecrire, 800)
}

export function vider(id: string): void {
  cache.set(id, [])
  sales.delete(id)
  try {
    rmSync(fichier(id), { force: true })
  } catch {
    // Rien à effacer.
  }
}

/** Écrit les fils modifiés. Appelé en fin de tour et à la fermeture. */
export function ecrire(): void {
  if (minuterie) clearTimeout(minuterie)
  minuterie = null
  if (!sales.size) return
  mkdirSync(dossier(), { recursive: true })
  for (const id of sales) {
    const f = (cache.get(id) ?? []).filter((b) => b.type !== 'demande')
    // Écrit à côté puis remplace : un arrêt brutal ne laisse pas un fil à moitié écrit.
    writeFileSync(fichier(id) + '.tmp', JSON.stringify(f), 'utf-8')
    renameSync(fichier(id) + '.tmp', fichier(id))
  }
  sales.clear()
}
