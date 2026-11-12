import { execFileSync, spawn } from 'child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { CompteFigma, OutilConnu, OutilMachine, Projet } from '@shared/types'
import { cheminClaude } from './claude'
import { dossierActif, dossierConfig } from './comptes'
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
// Le compte choisi dans Encre : ses connexions Figma sont les siennes (dossierConfig).

/** Les serveurs Figma qui ont une connexion dans le Claude Code de la machine (noms d'entrées seulement, jamais les jetons). */
/**
 * Les identifiants de Claude Code : un fichier sous Windows et Linux, le
 * trousseau sous macOS (élément « Claude Code-credentials »).
 */
function identifiants(): string {
  if (process.platform === 'darwin') {
    return execFileSync('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { encoding: 'utf-8', timeout: 5000 })
  }
  return readFileSync(join(dossierConfig(), '.credentials.json'), 'utf-8')
}

export function comptesFigma(): CompteFigma[] {
  try {
    const brut = JSON.parse(identifiants()) as {
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
 * Une console pour `claude mcp …` : `claude mcp login` refuse de tourner sans
 * terminal. Elle ouvre l'autorisation dans le navigateur habituel, Claude
 * Code récupère la connexion seul, et la fenêtre se ferme d'un Entrée.
 */
function ouvrirConsole(titre: string, intro: string[], commandes: string[][], cwd: string): boolean {
  const claude = cheminClaude()
  if (!claude) return false
  // Lancé hors de toute session Claude Code : sinon le `claude` de la console
  // hériterait des variables de l'hôte et se croirait déjà connecté.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE(?!_CONFIG_DIR)|ANTHROPIC_BASE_URL$)/.test(k)))
  const compte = dossierActif()
  if (compte) env.CLAUDE_CONFIG_DIR = compte
  const scripts = join(racine(), '.encre')
  mkdirSync(scripts, { recursive: true })
  if (process.platform === 'darwin') {
    const q = (x: string): string => `'${x.replace(/'/g, `'"'"'`)}'`
    const script = join(scripts, 'connecter.command')
    writeFileSync(
      script,
      [
        '#!/bin/zsh',
        `cd ${q(cwd)}`,
        ...intro.map((l) => `echo ${q(l)}`),
        ...commandes.map((c) => `${q(claude)} ${c.map(q).join(' ')}${c[1] === 'add' ? ' 2>/dev/null' : ''}`),
        'echo',
        `echo ${q('Tu peux fermer cette fenêtre et revenir dans Encre.')}`
      ].join('\n'),
      'utf-8'
    )
    chmodSync(script, 0o755)
    spawn('open', ['-a', 'Terminal', script], { cwd, env, detached: true, stdio: 'ignore' }).unref()
    return true
  }
  // PowerShell prend aussi les apostrophes courbes (’ ‘) pour des guillemets :
  // « s’ouvrir » fermait la chaîne et le script entier ne se lisait plus.
  const q = (x: string): string => `'${x.replace(/['‘’‚‛]/g, '$&$&')}'`
  const script = join(scripts, 'connecter.ps1')
  // PowerShell 5 lit un script sans BOM en ANSI : les accents casseraient.
  writeFileSync(
    script,
    '﻿' + [
      `$Host.UI.RawUI.WindowTitle = ${q(titre)}`,
      `Set-Location -LiteralPath ${q(cwd)}`,
      ...intro.map((l, n) => `Write-Host ${q(l)}${n === 0 ? ' -ForegroundColor Magenta' : ''}`),
      ...commandes.map((c) => `& ${q(claude)} ${c.map(q).join(' ')}${c[1] === 'add' ? ' 2>$null' : ''}`),
      `Write-Host ''`,
      `Write-Host 'Tu peux fermer cette fenêtre et revenir dans Encre.' -ForegroundColor Green`,
      `Read-Host 'Entrée pour fermer'`
    ].join('\r\n'),
    'utf-8'
  )
  spawn('cmd.exe', ['/c', 'start', '"Encre"', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `"${script}"`], {
    cwd,
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    windowsVerbatimArguments: true
  }).unref()
  return true
}

/**
 * Relie un nouveau compte Figma (déclaré dans le dossier d'Encre, portée
 * locale) puis ouvre l'autorisation. Le compte relié est celui déjà connecté
 * à figma.com dans le navigateur : le dire avant.
 */
export function relierFigma(nom: string): string | null {
  const serveur = 'figma-' + nom.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (serveur === 'figma-') return null
  const cwd = racine()
  mkdirSync(cwd, { recursive: true })
  const ok = ouvrirConsole(
    `Encre · relier ${serveur}`,
    [`Encre relie le compte Figma « ${serveur} ».`, 'Le navigateur va s’ouvrir : vérifie que figma.com y est connecté avec le BON compte.'],
    [['mcp', 'add', '--transport', 'http', '--scope', 'local', serveur, FIGMA], ['mcp', 'login', serveur]],
    cwd
  )
  if (!ok) return null
  journal(`relier figma : ${serveur}`)
  return serveur
}

/**
 * Des outils courants, avec l'adresse de leur serveur MCP officiel : un clic
 * les ajoute à Claude Code (pour tous les projets) et ouvre la connexion.
 * Notion ne marchait pas (12/11) : déclaré, jamais connecté, et Tako ne
 * pouvait que dire « ouvre un terminal ».
 */
export const CATALOGUE: OutilConnu[] = [
  { nom: 'notion', titre: 'Notion', aide: 'Pages, bases, tickets', url: 'https://mcp.notion.com/mcp' },
  { nom: 'linear', titre: 'Linear', aide: 'Tickets et projets', url: 'https://mcp.linear.app/mcp' },
  { nom: 'atlassian', titre: 'Jira et Confluence', aide: 'Tickets et documentation', url: 'https://mcp.atlassian.com/v1/mcp' },
  { nom: 'sentry', titre: 'Sentry', aide: 'Erreurs en production', url: 'https://mcp.sentry.dev/mcp' },
  { nom: 'vercel', titre: 'Vercel', aide: 'Déploiements et journaux', url: 'https://mcp.vercel.com' },
  { nom: 'stripe', titre: 'Stripe', aide: 'Paiements et clients', url: 'https://mcp.stripe.com' },
  { nom: 'canva', titre: 'Canva', aide: 'Designs et modèles', url: 'https://mcp.canva.com/mcp' }
]

/** Le `.claude.json` du compte actif : c'est là que Claude Code range ses serveurs. */
function fichierProfil(): string {
  const compte = dossierActif()
  if (compte) return join(compte, '.claude.json')
  return process.env.CLAUDE_CONFIG_DIR ? join(process.env.CLAUDE_CONFIG_DIR, '.claude.json') : join(homedir(), '.claude.json')
}

type Declaration = { type?: string; url?: string; headers?: Record<string, string> }

/** Les connexions OAuth des serveurs MCP, par nom (jamais les jetons eux-mêmes). */
function connexions(): Map<string, boolean> {
  const m = new Map<string, boolean>()
  try {
    const brut = JSON.parse(identifiants()) as { mcpOAuth?: Record<string, { accessToken?: string; refreshToken?: string; expiresAt?: number }> }
    for (const [cle, v] of Object.entries(brut.mcpOAuth ?? {})) {
      const nom = cle.split('|')[0]
      const ok = !!v.accessToken && (!v.expiresAt || v.expiresAt > Date.now() || !!v.refreshToken)
      m.set(nom, (m.get(nom) ?? false) || ok)
    }
  } catch {
    // Pas encore d'identifiants : aucun outil connecté.
  }
  return m
}

/**
 * Les outils que le Claude Code de la machine connaît pour ce dossier : ceux
 * de l'utilisateur, ceux propres au dossier (portée locale) et ceux de son
 * `.mcp.json`. Les comptes Figma ont leur propre rubrique.
 */
export function outilsMachine(dossier: string): OutilMachine[] {
  const vus = new Map<string, OutilMachine>()
  const ranger = (decl: Record<string, Declaration> | undefined, portee: OutilMachine['portee']): void => {
    for (const [nom, d] of Object.entries(decl ?? {})) {
      if (/^figma-/.test(nom) || /mcp\.figma\.com/.test(d.url ?? '')) continue
      const distant = !!d.url && d.type !== 'stdio'
      const aConnecter = distant && !d.headers?.Authorization && !d.headers?.authorization
      vus.set(nom, { nom, portee, distant, aConnecter, connecte: false })
    }
  }
  try {
    const profil = JSON.parse(readFileSync(fichierProfil(), 'utf-8')) as {
      mcpServers?: Record<string, Declaration>
      projects?: Record<string, { mcpServers?: Record<string, Declaration> }>
    }
    ranger(profil.mcpServers, 'tous')
    const cle = (x: string): string => x.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
    for (const [chemin, v] of Object.entries(profil.projects ?? {})) if (cle(chemin) === cle(dossier)) ranger(v.mcpServers, 'dossier')
  } catch {
    // Profil illisible : on montre au moins le .mcp.json.
  }
  try {
    const f = join(dossier, '.mcp.json')
    if (existsSync(f)) ranger((JSON.parse(readFileSync(f, 'utf-8')) as { mcpServers?: Record<string, Declaration> }).mcpServers, 'projet')
  } catch {
    // .mcp.json mal formé : Claude Code le signalera au tour.
  }
  const ok = connexions()
  for (const o of vus.values()) o.connecte = !o.aConnecter || !!ok.get(o.nom)
  return [...vus.values()].sort((a, b) => Number(a.connecte) - Number(b.connecte) || a.nom.localeCompare(b.nom))
}

/**
 * Connecte un outil : l'ajoute d'abord à Claude Code s'il vient du catalogue
 * ou d'une adresse donnée (pour tous les projets), puis ouvre l'autorisation.
 * Lancé dans le dossier du projet, pour trouver aussi les outils propres au
 * dossier.
 */
export function connecterOutil(nom: string, dossier: string, url?: string): string | null {
  const connu = CATALOGUE.find((c) => c.nom === nom.toLowerCase() || c.titre.toLowerCase() === nom.toLowerCase())
  const adresse = url?.trim() || connu?.url
  const serveur = (connu?.nom ?? nom).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '')
  if (!serveur) return null
  const cwd = existsSync(dossier) ? dossier : racine()
  const deja = outilsMachine(cwd).some((o) => o.nom === serveur)
  if (!deja && !adresse) return null
  const commandes: string[][] = deja ? [] : [['mcp', 'add', '--transport', 'http', '--scope', 'user', serveur, adresse!]]
  commandes.push(['mcp', 'login', serveur])
  const titre = connu?.titre ?? serveur
  const ok = ouvrirConsole(
    `Encre · connecter ${titre}`,
    [`Encre connecte ${titre}.`, 'Le navigateur va s’ouvrir : connecte-toi et accepte, puis reviens dans Encre.'],
    commandes,
    cwd
  )
  if (!ok) return null
  journal(`connecter outil : ${serveur}${deja ? '' : ` (ajouté, ${adresse})`}`)
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
