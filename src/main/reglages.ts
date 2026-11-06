import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { VOIX, type Reglages } from '@shared/types'
import { existe, lireSecret, poser } from './secrets'

/**
 * Les réglages d'Encre. La clé Groq n'y est pas : elle est chiffrée dans
 * `secrets.ts`, et le panneau ne sait que si elle existe.
 */

type Stock = Omit<Reglages, 'cleGroq'>

const DEFAUT: Stock = { voix: VOIX[0].id, veille: true, suite: true, demarrage: true }

const fichier = (): string => join(app.getPath('userData'), 'reglages.json')

let stock: Stock | null = null

function charger(): Stock {
  if (stock) return stock
  try {
    if (existsSync(fichier())) stock = { ...DEFAUT, ...(JSON.parse(readFileSync(fichier(), 'utf-8')) as Partial<Stock>) }
  } catch {
    // Illisible : les défauts.
  }
  stock ??= { ...DEFAUT }
  if (!existe('groq')) heriterCle()
  return stock
}

/**
 * La clé Groq d'Iris ou de VoiceType, reprise au premier lancement : c'est le
 * même compte, sur la même machine, et la recopier à la main est le genre de
 * friction qui fait abandonner un premier essai.
 */
function heriterCle(): void {
  const sources: [string, (j: Record<string, unknown>) => unknown][] = [
    [join(app.getPath('appData'), 'iris', 'reglages.json'), (j) => (j.fournisseur === 'groq' ? j.cleApi : null)],
    [join(app.getPath('appData'), 'voice-type', 'settings.json'), (j) => j.apiKey],
    [join(app.getPath('appData'), 'VoiceType', 'settings.json'), (j) => j.apiKey]
  ]
  for (const [chemin, prendre] of sources) {
    try {
      const cle = prendre(JSON.parse(readFileSync(chemin, 'utf-8')) as Record<string, unknown>)
      if (typeof cle === 'string' && cle.startsWith('gsk_')) {
        poser('groq', cle)
        return
      }
    } catch {
      // Application absente ou réglages illisibles : on essaie la suivante.
    }
  }
}

export function reglages(): Reglages {
  return { ...charger(), cleGroq: existe('groq') }
}

export function modifier(champs: Partial<Stock>): Reglages {
  stock = { ...charger(), ...champs }
  mkdirSync(dirname(fichier()), { recursive: true })
  writeFileSync(fichier(), JSON.stringify(stock, null, 2), 'utf-8')
  return reglages()
}

export const cleGroq = (): string | null => lireSecret('groq')
export const poserCleGroq = (cle: string | null): void => poser('groq', cle)
