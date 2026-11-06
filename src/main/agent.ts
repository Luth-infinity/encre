import {
  createSdkMcpServer, query, tool, type PermissionMode, type PermissionResult, type Query, type SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import { existsSync, statSync } from 'fs'
import { z } from 'zod'
import type { Diff, Evenement, Humeur, Mode, Outil, Projet, Reponse } from '@shared/types'
import { cheminClaude } from './claude'
import { journal } from './journal'
import * as projets from './projets'

/**
 * Un tour de conversation passe par le SDK de Claude Code, qui lance le
 * Claude Code de la machine : c'est le compte connecté qui paie, aucune clé.
 * Chaque message est un `query()` qui reprend la session du projet (`resume`).
 */

/** `projets` : la liste a changé (projet créé, ouvert), le panneau doit se mettre à jour. */
type Sortie = { evenement: (e: Evenement) => void; humeur: (h: Humeur) => void; projets?: () => void }

const texte = (t: string): { content: { type: 'text'; text: string }[] } => ({ content: [{ type: 'text', text: t }] })

/**
 * Les outils d'Encre, servis dans le process : Claude peut créer un projet,
 * en lier un existant ou en ouvrir un depuis la conversation (« je bosse sur
 * L'Oréal, projet BIM »). Le tour en cours reste dans son dossier : le projet
 * ouvert prend la main au message suivant.
 */
function outilsEncre(sortie: Sortie): ReturnType<typeof createSdkMcpServer> {
  const ouvrir = (id: string, ligne: string): void => {
    projets.choisir(id)
    sortie.evenement({ type: 'info', texte: ligne })
    sortie.projets?.()
  }
  return createSdkMcpServer({
    name: 'encre',
    version: '0.1.0',
    tools: [
      tool('lister_projets', 'Liste les projets d’Encre (id, nom, dossier). À appeler avant d’en créer un, pour ne pas faire de doublon.', {}, async () =>
        texte(JSON.stringify(projets.projets().map((p) => ({ id: p.id, nom: p.nom, dossier: p.dossier, actif: p.id === projets.actifId() })), null, 2))
      ),
      tool(
        'creer_projet',
        'Crée un projet Encre quand l’utilisateur veut travailler sur un client ou un sujet précis. Sans `dossier`, Encre crée Documents/Encre/Projets/<nom> avec un CLAUDE.md qui porte `contexte`. Avec `dossier` (un dossier existant), Encre le lie tel quel. Le projet s’ouvre au message suivant.',
        {
          nom: z.string().describe('Nom court et lisible, par exemple « L’Oréal · BIM »'),
          contexte: z.string().describe('Ce que tu sais du projet : client, objectif, outils, règles. Écrit dans le CLAUDE.md.'),
          dossier: z.string().optional().describe('Chemin d’un dossier existant à lier, si l’utilisateur en donne un')
        },
        async ({ nom, contexte, dossier }) => {
          if (dossier) {
            if (!existsSync(dossier) || !statSync(dossier).isDirectory()) return texte(`Le dossier ${dossier} n’existe pas.`)
            const p = projets.ajouter(dossier, nom)
            ouvrir(p.id, `Projet ${p.nom} lié`)
            return texte(`Projet « ${p.nom} » lié à ${p.dossier}. Il s’ouvre au prochain message.`)
          }
          const p = projets.creer(nom, contexte)
          ouvrir(p.id, `Projet ${p.nom} créé`)
          return texte(`Projet « ${p.nom} » créé dans ${p.dossier}, avec son CLAUDE.md. Il s’ouvre au prochain message.`)
        }
      ),
      tool('ouvrir_projet', 'Ouvre un projet Encre existant (par son id, voir lister_projets). Il prend la main au message suivant.', { id: z.string() }, async ({ id }) => {
        const p = projets.trouver(id)
        if (!p) return texte('Projet introuvable.')
        ouvrir(p.id, `Projet ${p.nom} ouvert`)
        return texte(`Projet « ${p.nom} » ouvert. Il prend la main au prochain message.`)
      })
    ]
  })
}

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

function consigne(projet: Projet): string {
  return [
    'Tu tournes dans Encre : une bulle (un poulpe) qui flotte sur le bureau de l’utilisateur et ouvre ce chat.',
    'Réponds en français, court et concret. Avant chaque étape, une phrase courte qui dit ce que tu fais.',
    'À la fin, dis ce que tu as changé en une à trois phrases. Pas de tiret cadratin au milieu d’une phrase.',
    '',
    projet.libre
      ? 'Mode Libre : aucun projet ouvert. Réponds à toutes les questions. Si l’utilisateur veut travailler sur un client ou un sujet précis (« je bosse sur L’Oréal, projet BIM »), regarde lister_projets : ouvre le projet s’il existe (ouvrir_projet), sinon crée-le (creer_projet) avec tout le contexte qu’il t’a donné, puis dis-lui que la suite se passe dans ce projet.'
      : `Projet ouvert : « ${projet.nom} » (${projet.dossier}). Pour changer de projet ou en créer un, utilise les outils encre.`
  ].join('\n')
}

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
  projets.modifier(projet.id, { derniere: debut })

  // Entrée en flux (un seul message, puis on ferme) : les outils servis dans
  // le process et `setPermissionMode` ne marchent que dans ce mode.
  async function* entree(): AsyncGenerator<SDKUserMessage> {
    yield { type: 'user', message: { role: 'user', content: texte }, parent_tool_use_id: null } as SDKUserMessage
  }

  const q = query({
    prompt: entree(),
    options: {
      cwd: projet.dossier,
      resume: projet.session ?? undefined,
      abortController: abort,
      includePartialMessages: true,
      permissionMode: MODES[projet.mode],
      // Les réglages de l'utilisateur et du projet : CLAUDE.md, .mcp.json, règles d'autorisation.
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: consigne(projet) },
      pathToClaudeCodeExecutable: cheminClaude() ?? undefined,
      env: envPropre(),
      mcpServers: { encre: outilsEncre(sortie) },
      allowedTools: ['mcp__encre__lister_projets', 'mcp__encre__creer_projet', 'mcp__encre__ouvrir_projet'],
      canUseTool: async (nom, entree, { signal, suggestions, toolUseID }): Promise<PermissionResult> => {
        // Les outils d'Encre ne touchent qu'à la liste des projets : jamais de demande.
        if (nom.startsWith('mcp__encre__')) return { behavior: 'allow', updatedInput: entree }
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
