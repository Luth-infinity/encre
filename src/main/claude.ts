import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { EtatClaude } from '@shared/types'
import { dossierConfig } from './comptes'

/**
 * Le Claude Code installé sur la machine. Encre ne demande aucun identifiant :
 * il passe par ce Claude Code, donc par le compte qui y est connecté.
 * Chemins repris de Calque (`commandeClaude`).
 */
export function cheminClaude(): string | null {
  const candidats =
    process.platform === 'win32'
      ? [
          join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
          join(homedir(), '.local', 'bin', 'claude.exe')
        ]
      : [
          join(homedir(), '.local', 'bin', 'claude'),
          join(homedir(), '.claude', 'local', 'claude'),
          '/opt/homebrew/bin/claude',
          '/usr/local/bin/claude',
          ...(process.env.PATH ?? '').split(':').filter(Boolean).map((d) => join(d, 'claude'))
        ]
  return candidats.find((c) => existsSync(c)) ?? null
}

/**
 * Sur macOS, une app lancée du Finder ou du Dock n'a que le PATH minimal
 * (`/usr/bin:/bin…`) : ni Homebrew, ni nvm, ni le `node` dont un Claude Code
 * installé par npm a besoin. On reprend celui du shell de connexion, une fois
 * au démarrage, comme le ferait le Terminal.
 */
export function reprendrePathDuShell(): void {
  if (process.platform !== 'darwin') return
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    const sortie = execFileSync(shell, ['-ilc', 'printf "__PATH__%s__PATH__" "$PATH"'], { encoding: 'utf-8', timeout: 5000 })
    const path = /__PATH__(.*)__PATH__/.exec(sortie)?.[1]
    if (path) process.env.PATH = [...new Set([...path.split(':'), ...(process.env.PATH ?? '').split(':')])].filter(Boolean).join(':')
  } catch {
    // Shell exotique ou trop lent : on garde le PATH tel quel, les chemins connus suffisent souvent.
  }
}

/**
 * Le fichier d'identifiants reste là quand la connexion expire : seul un
 * tour refusé le dit. Retenu jusqu'au prochain tour réussi.
 */
let expiree = false
export const noterConnexion = (ok: boolean): void => {
  expiree = !ok
}

/** Connecté = des identifiants dans le dossier de Claude Code (sous macOS, ils sont dans le trousseau). */
export function etatClaude(): EtatClaude {
  const chemin = cheminClaude()
  const dossier = dossierConfig()
  const connecte = process.platform === 'darwin' ? existsSync(dossier) : existsSync(join(dossier, '.credentials.json'))
  return { installe: !!chemin, connecte: connecte && !expiree, chemin }
}
