import { app, BrowserWindow, session } from 'electron'
import { spawn } from 'child_process'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { avatarDe, type Avatar, type Compte } from '@shared/types'
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

/** `avatars` : l'avatar choisi par compte (le principal compris) ; absent = Tako. */
type Stock = { comptes: { id: string; nom: string }[]; actif: string; avatars?: Record<string, string> }
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
    principal: c.id === PRINCIPAL,
    avatar: avatarDe(s.avatars?.[c.id]).id
  }))
}
export const actif = (): string => charger().actif
/** L'avatar du compte en cours : son nom et son ton passent dans la consigne. */
export const avatarActif = (): Avatar => avatarDe(charger().avatars?.[charger().actif])

export function choisirAvatar(compte: string, avatar: string): void {
  const s = charger()
  s.avatars = { ...s.avatars, [compte]: avatarDe(avatar).id }
  ecrire()
}

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
 * Connecte un compte. `claude auth login` ouvrait le navigateur habituel,
 * déjà connecté au compte de tous les jours : impossible d'en choisir un
 * autre, et il fallait recopier un code dans une console (essai du 08/11 :
 * « ça marche pas »). Ici, Encre lance la commande lui-même, ouvre l'adresse
 * dans une fenêtre vierge (session neuve, rien de connecté) et, quand
 * Claude renvoie vers la page du code, lit ce code dans l'adresse et le
 * donne à la commande. Résout avec une erreur lisible, ou null si connecté.
 */
export function connecter(id: string): Promise<string | null> {
  const claude = cheminClaude()
  if (!claude) return Promise.resolve('Claude Code est introuvable sur cette machine.')
  const d = id === PRINCIPAL ? dossierPrincipal() : dossierDe(id)
  mkdirSync(d, { recursive: true })
  // Hors de toute session Claude Code : sinon la commande se croirait déjà connectée par l'hôte.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC_BASE_URL$)/.test(k))) as NodeJS.ProcessEnv
  if (id !== PRINCIPAL) env.CLAUDE_CONFIG_DIR = d
  else if (process.env.CLAUDE_CONFIG_DIR) env.CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR
  // Que la commande n'ouvre pas aussi le navigateur habituel : la fenêtre d'Encre suffit.
  env.BROWSER = 'none'
  journal(`connexion du compte ${id}`)

  return new Promise((resoudre) => {
    let fini = false
    let fenetre: BrowserWindow | null = null
    let sortie = ''
    const finir = (erreur: string | null): void => {
      if (fini) return
      fini = true
      clearTimeout(delai)
      if (fenetre && !fenetre.isDestroyed()) fenetre.close()
      if (!enfant.killed && enfant.exitCode === null) enfant.kill()
      journal(`connexion du compte ${id} : ${erreur ?? 'ok'}`)
      resoudre(erreur)
    }
    const enfant = spawn(claude, ['auth', 'login'], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    const delai = setTimeout(() => finir('Connexion abandonnée au bout de 10 minutes.'), 600000)
    enfant.on('error', (e) => finir(`Impossible de lancer Claude Code (${e.message}).`))
    enfant.stderr.on('data', (b: Buffer) => (sortie += b.toString()))
    enfant.on('exit', (code) => {
      if (code === 0) return finir(null)
      const raison = /Login failed:\s*(.+)/.exec(sortie)?.[1]?.trim()
      finir(raison ? `Connexion refusée : ${raison}` : 'La connexion n’a pas abouti.')
    })
    enfant.stdout.on('data', (b: Buffer) => {
      sortie += b.toString()
      const adresse = /https:\/\/\S+\/oauth\/authorize\S+/.exec(sortie)?.[0]
      if (!adresse || fenetre) return
      fenetre = ouvrirFenetre(adresse, (code) => {
        enfant.stdin.write(`${code}\n`)
        fenetre?.hide()
      })
      fenetre.on('closed', () => {
        fenetre = null
        // Fermée avant la fin : la commande attend un code qui ne viendra pas.
        setTimeout(() => finir('Fenêtre de connexion fermée.'), 4000)
      })
    })
  })
}

/**
 * La fenêtre de connexion : une session neuve à chaque fois (aucun compte
 * déjà connecté), et l'agent d'un Chrome ordinaire, sans quoi Google refuse
 * la connexion dans une app (« navigateur non sécurisé »).
 */
function ouvrirFenetre(adresse: string, code: (c: string) => void): BrowserWindow {
  const s = session.fromPartition(`encre-connexion-${Date.now()}`)
  s.setUserAgent(s.getUserAgent().replace(/\s(Electron|encre|Encre)\/\S+/g, ''))
  const f = new BrowserWindow({
    width: 520, height: 760, title: 'Connexion à Claude', autoHideMenuBar: true, alwaysOnTop: true,
    webPreferences: { session: s, sandbox: true, contextIsolation: true }
  })
  const regarder = (url: string): void => {
    try {
      const u = new URL(url)
      if (!u.pathname.includes('/oauth/code/callback')) return
      const c = u.searchParams.get('code')
      const etat = u.searchParams.get('state')
      // La page du code affiche « code#state » : c'est ce que la commande attend.
      if (c) code(etat ? `${c}#${etat}` : c)
    } catch {
      // Adresse illisible : on attend la suivante.
    }
  }
  f.webContents.on('will-redirect', (_e, url) => regarder(url))
  f.webContents.on('will-navigate', (_e, url) => regarder(url))
  f.webContents.on('did-navigate', (_e, url) => regarder(url))
  // Les fenêtres de connexion Google ou Apple s'ouvrent en popup, dans la même session.
  f.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { session: s } } }))
  void f.loadURL(adresse)
  return f
}
