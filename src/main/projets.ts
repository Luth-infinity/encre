import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { randomUUID } from 'crypto'
import type { Projet } from '@shared/types'

/**
 * Les projets : un dossier, son mode d'autorisation, sa dernière conversation.
 * Le contexte du client (DA, règles) vit dans le CLAUDE.md du dossier, que
 * Claude Code lit seul ; les serveurs MCP (Figma, Notion) dans son `.mcp.json`.
 */

const COULEURS = ['#B7A6F5', '#3CC8F2', '#FF6FB5', '#FF9A3C', '#FFC933', '#3DDC84']

type Stock = { projets: Projet[]; actif: string | null }

const fichier = (): string => join(app.getPath('userData'), 'projets.json')

function lire(): Stock {
  try {
    if (existsSync(fichier())) return JSON.parse(readFileSync(fichier(), 'utf-8')) as Stock
  } catch {
    // Fichier abîmé : on repart d'une liste vide plutôt que de bloquer l'app.
  }
  return { projets: [], actif: null }
}

let stock = lire()
const ecrire = (): void => writeFileSync(fichier(), JSON.stringify(stock, null, 2), 'utf-8')

export const projets = (): Projet[] => stock.projets
export const actifId = (): string | null => stock.actif
export const actif = (): Projet | null => stock.projets.find((p) => p.id === stock.actif) ?? null

export function ajouter(dossier: string): Projet {
  const deja = stock.projets.find((p) => p.dossier.toLowerCase() === dossier.toLowerCase())
  if (deja) {
    stock.actif = deja.id
    ecrire()
    return deja
  }
  const p: Projet = {
    id: randomUUID(),
    nom: basename(dossier),
    dossier,
    couleur: COULEURS[stock.projets.length % COULEURS.length],
    mode: 'demander',
    session: null
  }
  stock.projets.push(p)
  stock.actif = p.id
  ecrire()
  return p
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

export function retirer(id: string): void {
  stock.projets = stock.projets.filter((p) => p.id !== id)
  if (stock.actif === id) stock.actif = stock.projets[0]?.id ?? null
  ecrire()
}
