import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { VOIX, VOIX_GEMINI, type Reglages } from '@shared/types'
import { existe, lireSecret, poser } from './secrets'
import { avatarActif } from './comptes'

/**
 * Les réglages d'Encre. La clé Groq n'y est pas : elle est chiffrée dans
 * `secrets.ts`, et le panneau ne sait que si elle existe.
 */

type Stock = Omit<Reglages, 'cleGroq' | 'cleGemini' | 'cleEleven'>

const DEFAUT: Stock = { voix: VOIX[0].id, voixPerso: [], veille: false, suite: true, demarrage: true, modele: 'auto', modeleEleven: 'rapide', voixAvatars: {} }

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
  // Une voix retirée de la liste (les multilingues) : on revient à celle par défaut.
  stock.voixPerso ??= []
  // Avant la 0.4.5, une seule voix pour tous : elle reste à l'avatar actif, les autres repartent de la voix par défaut.
  if (!stock.voixAvatars) stock.voixAvatars = { [avatarActif().id]: stock.voix }
  const connues = [...VOIX, ...VOIX_GEMINI, ...stock.voixPerso.map((v) => ({ id: `gemini:${v.id}` }))]
  // Les voix ElevenLabs viennent du compte (liste en ligne) : on les garde telles quelles.
  if (!stock.voix.startsWith('eleven:') && !connues.some((v) => v.id === stock!.voix)) stock.voix = DEFAUT.voix
  for (const [avatar, voix] of Object.entries(stock.voixAvatars)) {
    if (!voix.startsWith('eleven:') && !connues.some((v) => v.id === voix)) delete stock.voixAvatars[avatar]
  }
  if (!['auto', 'sonnet', 'opus', 'claude'].includes(stock.modele)) stock.modele = DEFAUT.modele
  if (!['rapide', 'naturel'].includes(stock.modeleEleven)) stock.modeleEleven = DEFAUT.modeleEleven
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
  const s = charger()
  // Un avatar sans voix à lui prend la voix par défaut, jamais celle d'un autre.
  const voix = s.voixAvatars[avatarActif().id] ?? DEFAUT.voix
  return { ...s, voix, cleGroq: existe('groq'), cleGemini: existe('gemini'), cleEleven: existe('eleven') }
}

export function modifier(champs: Partial<Stock>): Reglages {
  const { voix, ...reste } = champs
  stock = { ...charger(), ...reste }
  // Choisir une voix, c'est la choisir pour l'avatar du compte actif.
  if (voix) stock.voixAvatars = { ...stock.voixAvatars, [avatarActif().id]: voix }
  mkdirSync(dirname(fichier()), { recursive: true })
  writeFileSync(fichier(), JSON.stringify(stock, null, 2), 'utf-8')
  return reglages()
}

export const cleGroq = (): string | null => lireSecret('groq')
export const poserCleGroq = (cle: string | null): void => poser('groq', cle)
export const cleGemini = (): string | null => lireSecret('gemini')
export const poserCleGemini = (cle: string | null): void => poser('gemini', cle)
export const cleEleven = (): string | null => lireSecret('eleven')
export const poserCleEleven = (cle: string | null): void => poser('eleven', cle)
