import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

/**
 * Les secrets d'Encre (clé Groq, jetons des projets), chiffrés par le
 * système : DPAPI sous Windows, le Trousseau sous macOS. Le fichier ne
 * contient que du chiffré, jamais une clé lisible.
 */

const fichier = (): string => join(app.getPath('userData'), 'secrets.json')

function lire(): Record<string, string> {
  try {
    if (existsSync(fichier())) return JSON.parse(readFileSync(fichier(), 'utf-8')) as Record<string, string>
  } catch {
    // Illisible : on repart sans secrets, l'utilisateur les redonnera.
  }
  return {}
}

function ecrire(t: Record<string, string>): void {
  mkdirSync(dirname(fichier()), { recursive: true })
  writeFileSync(fichier() + '.tmp', JSON.stringify(t, null, 2), 'utf-8')
  renameSync(fichier() + '.tmp', fichier())
}

export function poser(cle: string, valeur: string | null): void {
  const t = lire()
  if (!valeur) delete t[cle]
  else if (safeStorage.isEncryptionAvailable()) t[cle] = safeStorage.encryptString(valeur.trim()).toString('base64')
  else throw new Error('Le chiffrement du système est indisponible : rien n’a été enregistré.')
  ecrire(t)
}

export function lireSecret(cle: string): string | null {
  const brut = lire()[cle]
  if (!brut) return null
  try {
    return safeStorage.decryptString(Buffer.from(brut, 'base64'))
  } catch {
    return null
  }
}

export const existe = (cle: string): boolean => !!lire()[cle]

/** Les clés d'un même préfixe, par exemple tous les jetons d'un projet. */
export const cles = (prefixe: string): string[] => Object.keys(lire()).filter((k) => k.startsWith(prefixe))
