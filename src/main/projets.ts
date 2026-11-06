import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import { randomUUID } from 'crypto'
import type { Projet } from '@shared/types'

/**
 * Les projets : un dossier, son mode d'autorisation, sa dernière conversation.
 * Le contexte du client (DA, règles) vit dans le CLAUDE.md du dossier, que
 * Claude Code lit seul ; les serveurs MCP (Figma, Notion) dans son `.mcp.json`.
 *
 * Le projet Libre est toujours là, en premier : c'est le chat sans projet.
 * Les projets créés depuis le chat vont dans Documents/Encre/Projets.
 */

const COULEURS = ['#3CC8F2', '#FF6FB5', '#FF9A3C', '#FFC933', '#3DDC84', '#B7A6F5']
const LIBRE = 'libre'

type Stock = { projets: Projet[]; actif: string | null }

const fichier = (): string => join(app.getPath('userData'), 'projets.json')
export const racine = (): string => process.env.ENCRE_RACINE || join(app.getPath('documents'), 'Encre')

function lire(): Stock {
  try {
    if (existsSync(fichier())) return JSON.parse(readFileSync(fichier(), 'utf-8')) as Stock
  } catch {
    // Fichier abîmé : on repart d'une liste vide plutôt que de bloquer l'app.
  }
  return { projets: [], actif: null }
}

let stock = lire()
// Au premier lancement, Electron n'a pas encore créé `userData` quand ce module se charge.
const ecrire = (): void => {
  mkdirSync(dirname(fichier()), { recursive: true })
  writeFileSync(fichier(), JSON.stringify(stock, null, 2), 'utf-8')
}

/** Le projet Libre existe toujours, son dossier aussi (Claude a besoin d'un endroit où travailler). */
function assurerLibre(): void {
  const dossier = join(racine(), 'Libre')
  mkdirSync(dossier, { recursive: true })
  let libre = stock.projets.find((p) => p.libre)
  if (!libre) {
    libre = { id: LIBRE, nom: 'Libre', dossier, couleur: '#E3E6E8', mode: 'demander', session: null, derniere: 0, libre: true }
    stock.projets.unshift(libre)
  }
  for (const p of stock.projets) p.derniere ??= 0
  if (!stock.actif || !stock.projets.some((p) => p.id === stock.actif)) stock.actif = libre.id
  ecrire()
}
assurerLibre()

export const projets = (): Projet[] => stock.projets
export const actifId = (): string | null => stock.actif
export const actif = (): Projet | null => stock.projets.find((p) => p.id === stock.actif) ?? null
export const trouver = (id: string): Projet | null => stock.projets.find((p) => p.id === id) ?? null

/** Lie un dossier existant (ou le reprend s'il est déjà connu) et l'ouvre. */
export function ajouter(dossier: string, nom?: string): Projet {
  const deja = stock.projets.find((p) => p.dossier.toLowerCase() === dossier.toLowerCase())
  if (deja) {
    stock.actif = deja.id
    ecrire()
    return deja
  }
  const p: Projet = {
    id: randomUUID(),
    nom: nom || basename(dossier),
    dossier,
    couleur: COULEURS[(stock.projets.length - 1) % COULEURS.length],
    mode: 'demander',
    session: null,
    derniere: Date.now()
  }
  stock.projets.push(p)
  stock.actif = p.id
  ecrire()
  return p
}

/** Nom de dossier sûr sous Windows, lisible : « L'Oréal · BIM » → « L'Oréal - BIM ». */
const nomDeDossier = (nom: string): string =>
  nom.replace(/[·•|/\\:]+/g, '-').replace(/[<>"?*]+/g, '').replace(/\s+/g, ' ').replace(/^[\s.-]+|[\s.-]+$/g, '') || 'Projet'

/** Crée un projet neuf dans Documents/Encre/Projets, avec un CLAUDE.md qui porte son contexte. */
export function creer(nom: string, contexte: string): Projet {
  let dossier = join(racine(), 'Projets', nomDeDossier(nom))
  for (let i = 2; existsSync(dossier) && stock.projets.some((p) => p.dossier === dossier); i++) {
    dossier = join(racine(), 'Projets', `${nomDeDossier(nom)} ${i}`)
  }
  mkdirSync(dossier, { recursive: true })
  const claudeMd = join(dossier, 'CLAUDE.md')
  if (!existsSync(claudeMd)) {
    writeFileSync(claudeMd, `# ${nom}\n\n${contexte.trim() || 'Contexte à compléter.'}\n`, 'utf-8')
  }
  return ajouter(dossier, nom)
}

export function choisir(id: string): void {
  if (stock.projets.some((p) => p.id === id)) stock.actif = id
  ecrire()
}

export function modifier(id: string, champs: Partial<Omit<Projet, 'id'>>): void {
  const p = stock.projets.find((x) => x.id === id)
  if (!p) return
  Object.assign(p, champs)
  ecrire()
}

/** Retire le projet d'Encre. Le dossier et ses fichiers restent sur le disque. */
export function retirer(id: string): void {
  if (trouver(id)?.libre) return
  stock.projets = stock.projets.filter((p) => p.id !== id)
  if (stock.actif === id) stock.actif = LIBRE
  assurerLibre()
}
