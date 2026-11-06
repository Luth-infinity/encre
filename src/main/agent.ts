import { query, type PermissionMode, type PermissionResult, type Query } from '@anthropic-ai/claude-agent-sdk'
import type { Diff, Evenement, Humeur, Mode, Outil, Projet, Reponse } from '@shared/types'
import { cheminClaude } from './claude'
import { journal } from './journal'
import * as projets from './projets'

/**
 * Un tour de conversation passe par le SDK de Claude Code, qui lance le
 * Claude Code de la machine : c'est le compte connecté qui paie, aucune clé.
 * Chaque message est un `query()` qui reprend la session du projet (`resume`).
 */

type Sortie = { evenement: (e: Evenement) => void; humeur: (h: Humeur) => void }

const MODES: Record<Mode, PermissionMode> = { demander: 'default', modifs: 'acceptEdits', auto: 'auto' }

let courant: { q: Query; abort: AbortController } | null = null
const enAttente = new Map<string, (r: Reponse) => void>()

export const enCours = (): boolean => courant !== null

const court = (s: string, n = 140): string => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function decrire(id: string, nom: string, e: Record<string, unknown>): Outil {
  const s = (k: string): string => (typeof e[k] === 'string' ? (e[k] as string) : '')
  const fichier = s('file_path') || s('notebook_path') || s('path')
  const nomFichier = fichier.split(/[\\/]/).pop() ?? fichier
  let libelle = nom
  let detail = ''
  let diff: Diff | undefined
  switch (nom) {
    case 'Read': libelle = `Lit ${nomFichier}`; break
    case 'Write': libelle = `Écrit ${nomFichier}`; diff = { fichier, avant: '', apres: s('content') }; break
    case 'Edit': libelle = `Modifie ${nomFichier}`; diff = { fichier, avant: s('old_string'), apres: s('new_string') }; break
    case 'MultiEdit': libelle = `Modifie ${nomFichier}`; break
    case 'Bash': case 'PowerShell': libelle = s('description') || 'Lance une commande'; detail = s('command'); break
    case 'Glob': case 'Grep': libelle = 'Cherche dans les fichiers'; detail = s('pattern'); break
    case 'WebFetch': libelle = 'Lit une page web'; detail = s('url'); break
    case 'WebSearch': libelle = 'Cherche sur le web'; detail = s('query'); break
    case 'Task': case 'Agent': libelle = 'Lance un agent'; detail = s('description'); break
    case 'TodoWrite': libelle = 'Met à jour sa liste'; break
    default: {
      const mcp = /^mcp__(.+?)__(.+)$/.exec(nom)
      if (mcp) libelle = `${mcp[1]} · ${mcp[2].replace(/_/g, ' ')}`
      detail = s('description')
    }
  }
  return { id, nom, libelle, detail: court(detail, 400), diff }
}

const CONSIGNE = [
  'Tu tournes dans Encre : une bulle (un poulpe) qui flotte sur le bureau de l’utilisateur et ouvre ce chat.',
  'Réponds en français, court et concret. Avant chaque étape, une phrase courte qui dit ce que tu fais.',
  'À la fin, dis ce que tu as changé en une à trois phrases. Pas de tiret cadratin au milieu d’une phrase.'
].join('\n')

/**
 * Lancé depuis une session Claude Code (terminal, app de bureau), Encre en
 * hériterait les variables : le Claude Code enfant croit alors que l'hôte gère
 * sa connexion et échoue (« OAuth session expired »). On ne garde que
 * `CLAUDE_CONFIG_DIR`, qui choisit le compte.
 */
function envPropre(): Record<string, string> {
  const env: Record<string, string> = {}
  const herite = !!process.env.CLAUDECODE
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue
    if (herite && /^(CLAUDE|ANTHROPIC_BASE_URL$)/.test(k) && k !== 'CLAUDE_CONFIG_DIR') continue
    env[k] = v
  }
  return env
}

export async function envoyer(projet: Projet, texte: string, sortie: Sortie): Promise<void> {
  if (courant) return
  const abort = new AbortController()
  const debut = Date.now()
  sortie.humeur('reflechit')

  const q = query({
    prompt: texte,
    options: {
      cwd: projet.dossier,
      resume: projet.session ?? undefined,
      abortController: abort,
      includePartialMessages: true,
      permissionMode: MODES[projet.mode],
      // Les réglages de l'utilisateur et du projet : CLAUDE.md, .mcp.json, règles d'autorisation.
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: CONSIGNE },
      pathToClaudeCodeExecutable: cheminClaude() ?? undefined,
      env: envPropre(),
      canUseTool: (nom, entree, { signal, suggestions, toolUseID }): Promise<PermissionResult> => {
        const id = String(toolUseID ?? Math.random())
        sortie.evenement({ type: 'demande', demande: decrire(id, nom, entree) })
        sortie.humeur('accord')
        return new Promise((resoudre) => {
          const clore = (r: Reponse): void => {
            enAttente.delete(id)
            sortie.evenement({ type: 'demande-close', id })
            sortie.humeur('bosse')
            if (r === 'non') resoudre({ behavior: 'deny', message: 'L’utilisateur a refusé.' })
            else resoudre({ behavior: 'allow', updatedInput: entree, updatedPermissions: r === 'toujours' ? suggestions : undefined })
          }
          enAttente.set(id, clore)
          signal.addEventListener('abort', () => clore('non'))
        })
      }
    }
  })
  courant = { q, abort }

  let erreur: string | undefined
  try {
    for await (const m of q) {
      if (m.type === 'system' && m.subtype === 'init') {
        projets.modifier(projet.id, { session: m.session_id })
      } else if (m.type === 'stream_event' && !m.parent_tool_use_id) {
        const ev = m.event
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          sortie.evenement({ type: 'texte', texte: ev.delta.text })
        }
      } else if (m.type === 'assistant' && !m.parent_tool_use_id) {
        for (const bloc of m.message.content) {
          if (bloc.type === 'tool_use') {
            sortie.humeur('bosse')
            sortie.evenement({ type: 'outil', outil: decrire(bloc.id, bloc.name, bloc.input as Record<string, unknown>) })
          }
        }
      } else if (m.type === 'result') {
        if (m.subtype !== 'success') erreur = 'Claude s’est arrêté avant la fin.'
        else if (m.is_error) erreur = traduire(String(m.result || 'Erreur de Claude Code.'))
      }
    }
  } catch (e) {
    erreur = abort.signal.aborted ? undefined : traduire(String((e as Error)?.message ?? e))
    journal(`tour en erreur : ${String(e)}`)
  } finally {
    courant = null
    enAttente.clear()
  }
  sortie.evenement({ type: 'fin', erreur, duree: Date.now() - debut })
  sortie.humeur(erreur ? 'repos' : 'fini')
}

function traduire(brut: string): string {
  if (/not logged in|\/login|authenticat|oauth|unauthorized|invalid api key/i.test(brut)) {
    return 'La connexion de Claude Code a expiré. Ouvre un terminal, lance `claude`, tape `/login`, puis renvoie ton message.'
  }
  if (/usage limit|rate.?limit|limit reached/i.test(brut)) return 'Limite d’usage atteinte sur ce compte Claude.'
  if (/ENOENT|spawn/i.test(brut)) return 'Claude Code est introuvable sur cette machine.'
  return brut
}

export function repondre(id: string, r: Reponse): void {
  enAttente.get(id)?.(r)
}

export function arreter(): void {
  courant?.abort.abort()
}

/** Change le mode en plein tour, sans attendre le message suivant. */
export async function changerMode(mode: Mode): Promise<void> {
  try {
    await courant?.q.setPermissionMode(MODES[mode])
  } catch {
    // Pas de tour en cours : le mode s'appliquera au prochain.
  }
}
