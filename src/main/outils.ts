import { spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { CompteFigma, Projet } from '@shared/types'
import { cheminClaude } from './claude'
import { journal } from './journal'
import { racine } from './projets'
import { cles, lireSecret, poser } from './secrets'

/**
 * Les outils d'un projet, branchés sans toucher aux fichiers :
 *
 * - **Figma** : un projet choisit ses comptes parmi les serveurs déjà reliés
 *   par `claude mcp login`. Encre les déclare au tour (même nom, même
 *   adresse) et Claude Code reprend la connexion faite, comme dans Calque.
 *   Un projet ne voit donc que le compte de son client.
 * - **Jetons** : rangés chiffrés (`secrets.ts`), donnés au Claude Code du
 *   projet en variables d'environnement. Un `.mcp.json` peut s'en servir
 *   (`${NOTION_TOKEN}`) sans que le jeton soit écrit nulle part en clair.
 */

const FIGMA = 'https://mcp.figma.com/mcp'
const dossierConfig = (): string => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')

/** Les serveurs Figma qui ont une connexion dans le Claude Code de la machine (noms d'entrées seulement, jamais les jetons). */
export function comptesFigma(): CompteFigma[] {
  try {
    const brut = JSON.parse(readFileSync(join(dossierConfig(), '.credentials.json'), 'utf-8')) as {
      mcpOAuth?: Record<string, { serverUrl?: string; accessToken?: string; refreshToken?: string; expiresAt?: number }>
    }
    const comptes = new Map<string, boolean>()
    for (const [cle, v] of Object.entries(brut.mcpOAuth ?? {})) {
      if (!/mcp\.figma\.com/.test(v.serverUrl ?? '') || cle.startsWith('plugin:')) continue
      const serveur = cle.split('|')[0]
      const relie = !!v.accessToken && (!v.expiresAt || v.expiresAt > Date.now() || !!v.refreshToken)
      comptes.set(serveur, (comptes.get(serveur) ?? false) || relie)
    }
    return [...comptes].map(([serveur, relie]) => ({ serveur, relie })).sort((a, b) => a.serveur.localeCompare(b.serveur))
  } catch {
    return []
  }
}

/** Les serveurs MCP qu'Encre ajoute au tour : les comptes Figma du projet. */
export function serveursDuProjet(p: Projet): Record<string, { type: 'http'; url: string }> {
  const s: Record<string, { type: 'http'; url: string }> = {}
  for (const nom of p.figma ?? []) if (/^[\w.-]+$/.test(nom)) s[nom] = { type: 'http', url: FIGMA }
  return s
}

const cleJeton = (projet: string, nom: string): string => `jeton:${projet}:${nom}`

/** Les jetons du projet, déchiffrés, à mettre dans l'environnement du Claude Code. */
export function envDuProjet(p: Projet): Record<string, string> {
  const env: Record<string, string> = {}
  for (const nom of p.jetons ?? []) {
    const v = lireSecret(cleJeton(p.id, nom))
    if (v) env[nom] = v
  }
  return env
}

/** Un nom de variable d'environnement : `NOTION_TOKEN`, pas « mon jeton ». */
export const nomDeJeton = (nom: string): string => nom.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^(\d)/, '_$1')

export function poserJeton(p: Projet, nom: string, valeur: string | null): string[] {
  const n = nomDeJeton(nom)
  poser(cleJeton(p.id, n), valeur)
  const reste = new Set(p.jetons ?? [])
  if (valeur) reste.add(n)
  else reste.delete(n)
  return [...reste]
}

/** Quand un projet est retiré, ses jetons partent avec lui. */
export function oublierJetons(projet: string): void {
  for (const c of cles(`jeton:${projet}:`)) poser(c, null)
}

/**
 * Relie un nouveau compte Figma : une console (`claude mcp login` refuse de
 * tourner sans terminal) déclare le serveur dans le dossier d'Encre puis
 * ouvre l'autorisation dans le navigateur. Le compte relié est celui déjà
 * connecté à figma.com dans le navigateur : le dire avant.
 */
export function relierFigma(nom: string): string | null {
  const serveur = 'figma-' + nom.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (serveur === 'figma-') return null
  const claude = cheminClaude()
  if (!claude) return null
  const cwd = racine()
  mkdirSync(cwd, { recursive: true })
  const script = join(cwd, '.relier-figma.ps1')
  // PowerShell 5 lit un script sans BOM en ANSI : les accents casseraient.
  writeFileSync(
    script,
    '﻿' + [
      `$Host.UI.RawUI.WindowTitle = 'Encre · relier ${serveur}'`,
      `Write-Host 'Encre relie le compte Figma « ${serveur} ».' -ForegroundColor Magenta`,
      `Write-Host 'Le navigateur va s''ouvrir : vérifie que figma.com y est connecté avec le BON compte.'`,
      `& '${claude}' mcp add --transport http --scope local '${serveur}' '${FIGMA}' 2>$null`,
      `& '${claude}' mcp login '${serveur}'`,
      `Write-Host ''`,
      `Write-Host 'Tu peux fermer cette fenêtre et revenir dans Encre.' -ForegroundColor Green`,
      `Read-Host 'Entrée pour fermer'`
    ].join('\r\n'),
    'utf-8'
  )
  // Lancé hors de toute session Claude Code : sinon le `claude` de la console
  // hériterait des variables de l'hôte et se croirait déjà connecté.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE(?!_CONFIG_DIR)|ANTHROPIC_BASE_URL$)/.test(k)))
  spawn('cmd.exe', ['/c', 'start', '"Encre"', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `"${script}"`], {
    cwd,
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    windowsVerbatimArguments: true
  }).unref()
  journal(`relier figma : ${serveur}`)
  return serveur
}

/** Les serveurs déclarés dans le `.mcp.json` du dossier, pour les montrer (Claude Code les charge seul). */
export function serveursDuDossier(dossier: string): string[] {
  try {
    const f = join(dossier, '.mcp.json')
    if (!existsSync(f)) return []
    return Object.keys((JSON.parse(readFileSync(f, 'utf-8')) as { mcpServers?: object }).mcpServers ?? {})
  } catch {
    return []
  }
}
