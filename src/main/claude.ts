import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { EtatClaude } from '@shared/types'

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
          '/usr/local/bin/claude'
        ]
  return candidats.find((c) => existsSync(c)) ?? null
}

/** Connecté = des identifiants dans le dossier de Claude Code (sous macOS, ils sont dans le trousseau). */
export function etatClaude(): EtatClaude {
  const chemin = cheminClaude()
  const dossier = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  const connecte = process.platform === 'darwin' ? existsSync(dossier) : existsSync(join(dossier, '.credentials.json'))
  return { installe: !!chemin, connecte, chemin }
}
