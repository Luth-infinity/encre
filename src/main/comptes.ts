import { app } from 'electron'
import { spawn } from 'child_process'
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { Compte } from '@shared/types'
import { cheminClaude } from './claude'
import { journal } from './journal'

/**
 * Plusieurs comptes Claude sur la même machine (le perso, celui du boulot) :
 * Claude Code range sa connexion dans son dossier de config, et
 * `CLAUDE_CONFIG_DIR` choisit ce dossier. Le compte principal est celui du
 * terminal ; chaque autre a son dossier dans `userData/comptes/<id>`.
 *
 * Changer de compte ne doit rien faire perdre : les dossiers partagés
 * (sessions, skills, plugins…) pointent vers ceux du principal (jonctions,
 * sans droits d'admin sous Windows), donc une conversation reprend sur
 * l'autre compte. Seuls la connexion et le `.claude.json` sont propres.
 */

type Stock = { comptes: { id: string; nom: string }[]; actif: string }
const PRINCIPAL = 'principal'
const PARTAGES = ['projects', 'skills', 'plugins', 'agents', 'commands', 'file-history', 'todos']

const fichier = (): string => join(app.getPath('userData'), 'comptes.json')
const dossierDe = (id: string): string => join(app.getPath('userData'), 'comptes', id)
/** Le dossier du compte du terminal : celui que Claude Code prend sans rien lui dire. */
const dossierPrincipal = (): string => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')

let stock: Stock | null = null
function charger(): Stock {
  if (stock) return stock
  try {
    stock = JSON.parse(readFileSync(fichier(), 'utf-8')) as Stock
  } catch {
    stock = { comptes: [], actif: PRINCIPAL }
  }
  if (stock.actif !== PRINCIPAL && !stock.comptes.some((c) => c.id === stock!.actif)) stock.actif = PRINCIPAL
  return stock
}
function ecrire(): void {
  writeFileSync(fichier(), JSON.stringify(charger(), null, 2), 'utf-8')
}

/** Le dossier de config du compte choisi : à passer en `CLAUDE_CONFIG_DIR`, sauf pour le principal (null). */
export function dossierActif(): string | null {
  const a = charger().actif
  return a === PRINCIPAL ? null : dossierDe(a)
}
export const dossierConfig = (): string => dossierActif() ?? dossierPrincipal()

/** Le `.claude.json` du compte : à côté du dossier pour le principal sans `CLAUDE_CONFIG_DIR`, dedans sinon. */
function profil(id: string): { email: string | null; offre: string | null } {
  const chemin =
    id !== PRINCIPAL ? join(dossierDe(id), '.claude.json')
      : process.env.CLAUDE_CONFIG_DIR ? join(process.env.CLAUDE_CONFIG_DIR, '.claude.json')
        : join(homedir(), '.claude.json')
  try {
    const j = JSON.parse(readFileSync(chemin, 'utf-8')) as { oauthAccount?: { emailAddress?: string; organizationName?: string; billingType?: string } }
    const o = j.oauthAccount
    // Un compte perso a une organisation au nom de son adresse : rien à en dire.
    const org = o?.organizationName && !o.organizationName.includes('@') ? o.organizationName : null
    return { email: o?.emailAddress ?? null, offre: org }
  } catch {
    return { email: null, offre: null }
  }
}

function connecte(id: string): boolean {
  const d = id === PRINCIPAL ? dossierPrincipal() : dossierDe(id)
  // Sous macOS, la connexion est dans le trousseau : le profil suffit à dire qu'il y en a eu une.
  if (process.platform === 'darwin') return !!profil(id).email
  return existsSync(join(d, '.credentials.json'))
}

export function comptes(): Compte[] {
  const s = charger()
  return [{ id: PRINCIPAL, nom: 'Principal' }, ...s.comptes].map((c) => ({
    ...c,
    ...profil(c.id),
    connecte: connecte(c.id),
    actif: c.id === s.actif,
    principal: c.id === PRINCIPAL
  }))
}
export const actif = (): string => charger().actif

export function choisir(id: string): boolean {
  const s = charger()
  if (id !== PRINCIPAL && !s.comptes.some((c) => c.id === id)) return false
  s.actif = id
  ecrire()
  journal(`compte : ${id}`)
  return true
}

/**
 * Un nouveau compte : son dossier, relié au principal pour tout ce qui n'est
 * pas la connexion. Les réglages (`settings.json`, CLAUDE.md) sont copiés
 * plutôt que liés : Claude Code les réécrit en remplaçant le fichier, ce qui
 * casserait un lien.
 */
export function ajouter(nom: string): string {
  const s = charger()
  const base = nom.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'compte'
  let id = base
  for (let n = 2; id === PRINCIPAL || s.comptes.some((c) => c.id === id); n++) id = `${base}-${n}`
  const d = dossierDe(id)
  mkdirSync(d, { recursive: true })
  const source = dossierPrincipal()
  for (const nomDossier of PARTAGES) {
    const cible = join(source, nomDossier)
    try {
      mkdirSync(cible, { recursive: true })
      symlinkSync(cible, join(d, nomDossier), 'junction')
    } catch (e) {
      journal(`compte ${id} : lien ${nomDossier} impossible (${String(e)})`)
    }
  }
  for (const f of ['settings.json', 'CLAUDE.md']) {
    if (existsSync(join(source, f))) copyFileSync(join(source, f), join(d, f))
  }
  // Les serveurs MCP déclarés pour l'utilisateur suivent ; leurs connexions, elles, sont à refaire.
  try {
    const principal = JSON.parse(readFileSync(process.env.CLAUDE_CONFIG_DIR ? join(source, '.claude.json') : join(homedir(), '.claude.json'), 'utf-8')) as { mcpServers?: unknown }
    if (principal.mcpServers) writeFileSync(join(d, '.claude.json'), JSON.stringify({ mcpServers: principal.mcpServers }, null, 2), 'utf-8')
  } catch {
    // Pas de profil principal : le nouveau compte part de zéro.
  }
  s.comptes.push({ id, nom: nom.trim() || 'Autre compte' })
  ecrire()
  return id
}

/** Retire un compte d'Encre : son dossier part, mais les liens ne touchent pas aux dossiers du principal. */
export function retirer(id: string): void {
  const s = charger()
  if (id === PRINCIPAL) return
  s.comptes = s.comptes.filter((c) => c.id !== id)
  if (s.actif === id) s.actif = PRINCIPAL
  ecrire()
  const d = dossierDe(id)
  // Les jonctions d'abord, une par une : un `rm -r` sur le dossier suivrait les liens.
  for (const nomDossier of PARTAGES) {
    try {
      if (lstatSync(join(d, nomDossier)).isSymbolicLink()) unlinkSync(join(d, nomDossier))
    } catch {
      // Déjà parti.
    }
  }
  // Un lien qui aurait résisté : on laisse le dossier plutôt que de risquer les sessions du principal.
  if (PARTAGES.some((n) => existsSync(join(d, n)))) return journal(`compte ${id} : dossier gardé, un lien n’a pas pu partir`)
  rmSync(d, { recursive: true, force: true })
}

/**
 * Connecte un compte : `claude auth login` veut un terminal (il ouvre le
 * navigateur puis attend). On le lance dans une console avec le bon
 * `CLAUDE_CONFIG_DIR`, et on surveille l'arrivée de la connexion pour
 * prévenir le panneau sans qu'il ait à demander.
 */
export function connecter(id: string, fini: () => void): boolean {
  const claude = cheminClaude()
  if (!claude) return false
  const d = id === PRINCIPAL ? dossierPrincipal() : dossierDe(id)
  const nom = comptes().find((c) => c.id === id)?.nom ?? id
  // Hors de toute session Claude Code : sinon la console se croirait déjà connectée par l'hôte.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC_BASE_URL$)/.test(k)))
  if (id !== PRINCIPAL) env.CLAUDE_CONFIG_DIR = d
  else if (process.env.CLAUDE_CONFIG_DIR) env.CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR
  mkdirSync(d, { recursive: true })
  const creds = join(d, '.credentials.json')
  const avant = existsSync(creds) ? statSync(creds).mtimeMs : 0

  if (process.platform === 'darwin') {
    const q = (s: string): string => `'${s.replace(/'/g, `'"'"'`)}'`
    const script = join(d, '.connecter.command')
    writeFileSync(
      script,
      [
        '#!/bin/zsh',
        id !== PRINCIPAL ? `export CLAUDE_CONFIG_DIR=${q(d)}` : '',
        `echo ${q(`Encre connecte le compte Claude « ${nom} ».`)}`,
        `echo ${q('Le navigateur va s’ouvrir : connecte-toi avec le compte voulu.')}`,
        `${q(claude)} auth login`,
        'echo',
        `echo ${q('Tu peux fermer cette fenêtre et revenir dans Encre.')}`
      ].join('\n'),
      'utf-8'
    )
    chmodSync(script, 0o755)
    spawn('open', ['-a', 'Terminal', script], { env, detached: true, stdio: 'ignore' }).unref()
  } else {
    const script = join(d, '.connecter.ps1')
    const ps = (s: string): string => `'${s.replace(/'/g, "''")}'`
    // PowerShell 5 lit un script sans BOM en ANSI : les accents casseraient.
    writeFileSync(
      script,
      '﻿' + [
        `$Host.UI.RawUI.WindowTitle = ${ps(`Encre · compte ${nom}`)}`,
        id !== PRINCIPAL ? `$env:CLAUDE_CONFIG_DIR = ${ps(d)}` : '',
        `Write-Host ${ps(`Encre connecte le compte Claude « ${nom} ».`)} -ForegroundColor Magenta`,
        `Write-Host ${ps('Le navigateur va s’ouvrir : connecte-toi avec le compte voulu.')}`,
        `& ${ps(claude)} auth login`,
        `Write-Host ''`,
        `Write-Host ${ps('Tu peux fermer cette fenêtre et revenir dans Encre.')} -ForegroundColor Green`,
        `Read-Host 'Entrée pour fermer'`
      ].join('\r\n'),
      'utf-8'
    )
    spawn('cmd.exe', ['/c', 'start', '"Encre"', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `"${script}"`], {
      env, detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true
    }).unref()
  }
  journal(`connexion du compte ${id}`)
  // Dix minutes pour se connecter dans le navigateur ; au-delà, le panneau verra au prochain état.
  const debut = Date.now()
  const guet = setInterval(() => {
    const ok = process.platform === 'darwin' ? !!profil(id).email : existsSync(creds) && statSync(creds).mtimeMs > avant
    if (ok || Date.now() - debut > 600000) {
      clearInterval(guet)
      if (ok) fini()
    }
  }, 2000)
  return true
}
