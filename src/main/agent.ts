import {
  createSdkMcpServer, query, tool, type PermissionMode, type PermissionResult, type Query, type SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import { existsSync, statSync } from 'fs'
import { z } from 'zod'
import type { Commande, Diff, Evenement, Fenetre, Humeur, Limites, Mode, Outil, PieceJointe, Projet, Reponse } from '@shared/types'
import { cheminClaude, noterConnexion } from './claude'
import { dossierActif } from './comptes'
import * as fils from './fils'
import { journal } from './journal'
import { envDuProjet, serveursDuProjet } from './outils'
import * as projets from './projets'
import { Diseur } from './voix'

/**
 * Un tour de conversation passe par le SDK de Claude Code, qui lance le
 * Claude Code de la machine : c'est le compte connecté qui paie, aucune clé.
 * Chaque message est un `query()` qui reprend la session du projet (`resume`).
 */

/**
 * `projets` : la liste a changé (projet créé, ouvert), le panneau doit se mettre à jour.
 * `audio` : en mode Parler, la réponse dite phrase par phrase (MP3).
 */
type Sortie = {
  evenement: (e: Evenement) => void
  humeur: (h: Humeur) => void
  projets?: () => void
  audio?: (mp3: Buffer) => void
  /** Claude Code a donné l'état des limites du compte (à chaque appel à l'API). */
  limites?: (l: Limites) => void
  /**
   * Tako a créé ou ouvert un projet. C'est l'appelant qui décide s'il prend
   * l'écran : avec plusieurs tours en parallèle, un projet qui travaille en
   * arrière-plan ne doit pas arracher la vue à celui qu'on regarde.
   */
  ouvert?: (id: string) => void
}

/** Ce qui accompagne le texte : les pièces jointes, et la voix choisie en mode Parler. */
type Options = { pieces?: PieceJointe[]; voix?: string }

const texte = (t: string): { content: { type: 'text'; text: string }[] } => ({ content: [{ type: 'text', text: t }] })

/**
 * Les outils d'Encre, servis dans le process : Claude peut créer un projet,
 * en lier un existant ou en ouvrir un depuis la conversation (« je bosse sur
 * L'Oréal, projet BIM »). Le tour en cours reste dans son dossier : le projet
 * ouvert prend la main au message suivant.
 */
function outilsEncre(sortie: Sortie): ReturnType<typeof createSdkMcpServer> {
  const ouvrir = (id: string, ligne: string): void => {
    if (sortie.ouvert) sortie.ouvert(id)
    else projets.choisir(id)
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
          fils.noter(p.id, { type: 'info', texte: 'Projet créé depuis le chat' })
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

/**
 * Un tour par projet : Tako peut travailler sur plusieurs projets à la fois
 * (un Claude Code chacun, dans son dossier). Deux tours dans le même projet
 * se marcheraient dessus (même session) : le second message y est glissé.
 */
type Tour = { q: Query; abort: AbortController; glisser: (m: SDKUserMessage) => boolean; demandes: Set<string> }
const tours = new Map<string, Tour>()
const enAttente = new Map<string, (r: Reponse) => void>()

/** Sans projet : un tour tourne-t-il quelque part ? */
export const enCours = (projet?: string): boolean => (projet ? tours.has(projet) : tours.size > 0)
/** Les projets qui travaillent en ce moment. */
export const projetsEnCours = (): string[] => [...tours.keys()]

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

function consigne(projet: Projet, voix: boolean): string {
  return [
    ...(voix
      ? [
          'MODE PARLER : ta réponse est lue à voix haute. Écris pour l’oreille : phrases courtes, aucune liste, aucun tableau, aucun code, aucun chemin de fichier, pas d’emoji. Deux à quatre phrases suffisent, sauf si on te demande plus. Tu peux quand même agir avec tes outils.',
          // Un lien épelé (« encre-app point vercel point app ») était illisible à l'écran :
          // en lien Markdown, il est cliquable dans le fil et la voix n'en lit que le texte.
          'Si tu donnes un lien, écris-le en lien Markdown avec un texte court, par exemple [le site d’Encre](https://…) : il sera cliquable à l’écran, et la voix ne lira que le texte. N’épelle jamais une adresse.',
          ''
        ]
      : []),
    'Tu es Tako, le poulpe d’Encre : une bulle qui flotte sur le bureau de l’utilisateur et ouvre ce chat. Si on te demande ton nom, c’est Tako. Ton ton est chaleureux et un peu espiègle, sans en faire trop.',
    'Réponds en français, court et concret. Avant chaque étape, une phrase courte qui dit ce que tu fais.',
    'À la fin, dis ce que tu as changé en une à trois phrases. Pas de tiret cadratin au milieu d’une phrase.',
    '',
    projet.libre
      ? 'Mode Libre : un brouillon qui repart à vide à chaque visite. Une question rapide (une info, une explication, une formulation) se traite ici, sans projet. Mais dès que l’utilisateur veut FAIRE quelque chose qui demande du travail ou un suivi (« j’aimerais faire tel truc », un client, un sujet, une app, un document à produire), ne commence pas le travail ici : regarde lister_projets, ouvre le projet s’il existe (ouvrir_projet), sinon crée-le tout de suite sans lui demander (creer_projet) avec un nom court et tout le contexte qu’il t’a donné. Dis-lui en une phrase que tu t’y mets dans ce projet, et arrête-toi : Encre y déplace la conversation et t’y relance aussitôt.'
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
  // Le compte choisi dans Encre : son dossier de config porte sa connexion.
  const compte = dossierActif()
  if (compte) env.CLAUDE_CONFIG_DIR = compte
  return env
}

/**
 * Le message tel que Claude le reçoit. Les images partent en blocs (Claude
 * les voit) ; les autres fichiers par leur chemin, que Claude lit lui-même
 * avec ses outils : un PDF de 40 pages n'a rien à faire dans le message.
 */
function contenu(texte: string, pieces: PieceJointe[]): SDKUserMessage['message']['content'] {
  const fichiers = pieces.filter((p) => p.chemin && !p.image)
  const images = pieces.filter((p) => p.image)
  const corps =
    [texte, fichiers.length ? `Fichiers joints :\n${fichiers.map((f) => `- ${f.chemin}`).join('\n')}` : '']
      .filter(Boolean)
      .join('\n\n') || 'Regarde ces images.'
  if (!images.length) return corps
  return [
    ...images.map((p) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: p.image!.media as 'image/png', data: p.image!.donnees }
    })),
    { type: 'text' as const, text: corps }
  ]
}

export async function envoyer(projet: Projet, texte: string, sortie: Sortie, options: Options = {}): Promise<void> {
  if (tours.has(projet.id)) return
  const abort = new AbortController()
  const debut = Date.now()
  sortie.humeur('reflechit')
  projets.modifier(projet.id, { derniere: debut })
  const diseur =
    options.voix && sortie.audio
      ? new Diseur({ voix: options.voix, dossier: projet.dossier }, sortie.audio, (l) => journal(l))
      : null

  // Entrée en flux : les outils servis dans le process et `setPermissionMode`
  // ne marchent que dans ce mode. **L'entrée reste ouverte jusqu'à la fin du
  // tour** : fermée juste après le message, Claude Code coupait les demandes
  // d'autorisation restées sans réponse quelques secondes (« Operation
  // aborted », « la demande s'est coupée avant que tu puisses répondre »).
  // Elle sert aussi à glisser les messages écrits pendant que Tako travaille.
  const file: SDKUserMessage[] = []
  let reveil: (() => void) | null = null
  let ferme = false
  const finEntree = (): void => {
    ferme = true
    reveil?.()
  }
  abort.signal.addEventListener('abort', finEntree)
  async function* entree(): AsyncGenerator<SDKUserMessage> {
    yield {
      type: 'user',
      message: { role: 'user', content: contenu(texte, options.pieces ?? []) },
      parent_tool_use_id: null
    } as SDKUserMessage
    while (!ferme) {
      while (file.length && !ferme) yield file.shift()!
      if (!ferme) await new Promise<void>((r) => (reveil = r))
      reveil = null
    }
  }
  /**
   * Un message glissé en plein tour (`priority: 'next'`) : Claude Code le
   * donne à Claude au prochain appel, entre deux outils, comme dans le
   * terminal (essai du 07/11 : pris en compte, un seul `result`). S'il arrive
   * après le dernier appel, Claude Code en fait un nouveau tour : d'où le
   * délai de grâce après un `result` qui suit un message glissé.
   */
  let glisses = 0
  const glisser = (m: SDKUserMessage): boolean => {
    if (ferme) return false
    glisses++
    file.push({ ...m, priority: 'next' })
    reveil?.()
    return true
  }
  let grace: ReturnType<typeof setTimeout> | null = null
  const demandes = new Set<string>()

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
      systemPrompt: { type: 'preset', preset: 'claude_code', append: consigne(projet, !!diseur) },
      pathToClaudeCodeExecutable: cheminClaude() ?? undefined,
      env: { ...envPropre(), ...envDuProjet(projet) },
      mcpServers: { ...serveursDuProjet(projet), encre: outilsEncre(sortie) },
      allowedTools: ['mcp__encre__lister_projets', 'mcp__encre__creer_projet', 'mcp__encre__ouvrir_projet'],
      canUseTool: async (nom, entree, { signal, suggestions, toolUseID }): Promise<PermissionResult> => {
        // Les outils d'Encre ne touchent qu'à la liste des projets : jamais de demande.
        if (nom.startsWith('mcp__encre__')) return { behavior: 'allow', updatedInput: entree }
        const id = String(toolUseID ?? Math.random())
        diseur?.finirPhrase()
        sortie.evenement({ type: 'demande', demande: decrire(id, nom, entree) })
        sortie.humeur('accord')
        const posee = Date.now()
        return new Promise((resoudre) => {
          const clore = (r: Reponse): void => {
            enAttente.delete(id)
            demandes.delete(id)
            sortie.evenement({ type: 'demande-close', id })
            sortie.humeur('bosse')
            if (r === 'non') resoudre({ behavior: 'deny', message: 'L’utilisateur a refusé.' })
            else resoudre({ behavior: 'allow', updatedInput: entree, updatedPermissions: r === 'toujours' ? suggestions : undefined })
          }
          enAttente.set(id, clore)
          demandes.add(id)
          signal.addEventListener('abort', () => {
            journal(`demande ${nom} coupée par Claude Code au bout de ${Math.round((Date.now() - posee) / 1000)} s`)
            clore('non')
          })
        })
      }
    }
  })
  tours.set(projet.id, { q, abort, glisser, demandes })

  let erreur: string | undefined
  try {
    for await (const m of q) {
      // Un tour relancé par un message glissé trop tard : on attend sa fin.
      if (grace && m.type !== 'result') {
        clearTimeout(grace)
        grace = null
      }
      if (m.type === 'rate_limit_event') {
        const l = depuisEvenement(m.rate_limit_info as InfoLimite)
        if (l) sortie.limites?.(l)
      } else if (m.type === 'system' && m.subtype === 'init') {
        projets.modifier(projet.id, {
          session: m.session_id,
          serveurs: m.mcp_servers.filter((s) => s.name !== 'encre').map((s) => ({ nom: s.name, etat: s.status }))
        })
      } else if (m.type === 'stream_event' && !m.parent_tool_use_id) {
        const ev = m.event
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          sortie.evenement({ type: 'texte', texte: ev.delta.text })
          diseur?.pousser(ev.delta.text)
        }
      } else if (m.type === 'assistant' && !m.parent_tool_use_id) {
        for (const bloc of m.message.content) {
          if (bloc.type === 'tool_use') {
            diseur?.finirPhrase()
            sortie.humeur('bosse')
            sortie.evenement({ type: 'outil', outil: decrire(bloc.id, bloc.name, bloc.input as Record<string, unknown>) })
          }
        }
      } else if (m.type === 'result') {
        if (glisses) {
          glisses = 0
          grace = setTimeout(finEntree, 5000)
        } else finEntree()
        if (m.subtype !== 'success') erreur = 'Claude s’est arrêté avant la fin.'
        else if (m.is_error) erreur = traduire(String(m.result || 'Erreur de Claude Code.'))
      }
    }
  } catch (e) {
    erreur = abort.signal.aborted ? undefined : traduire(String((e as Error)?.message ?? e))
    journal(`tour en erreur : ${String(e)}`)
  } finally {
    if (grace) clearTimeout(grace)
    finEntree()
    tours.delete(projet.id)
    for (const id of demandes) enAttente.delete(id)
    if (abort.signal.aborted) diseur?.taire()
    else diseur?.terminer()
  }
  if (erreur?.startsWith('La connexion de Claude Code a expiré')) noterConnexion(false)
  else if (!erreur) noterConnexion(true)
  sortie.evenement({ type: 'fin', erreur, duree: Date.now() - debut })
  sortie.humeur(erreur ? 'repos' : 'fini')
  // La voix n'a pas forcément fini : avec Gemini, la réponse part d'un bloc
  // après le texte. Le tour n'est fini (« tour-fini », micro rendu) qu'une
  // fois le dernier son envoyé au panneau, sinon il se perdait.
  if (diseur && !abort.signal.aborted) await diseur.attendre()
}

function traduire(brut: string): string {
  if (/not logged in|\/login|authenticat|oauth|unauthorized|invalid api key/i.test(brut)) {
    return 'La connexion de Claude Code a expiré. Ouvre un terminal, lance `claude`, tape `/login`, puis renvoie ton message.'
  }
  if (/usage limit|rate.?limit|limit reached/i.test(brut)) return 'Limite d’usage atteinte sur ce compte Claude.'
  if (/ENOENT|spawn/i.test(brut)) return 'Claude Code est introuvable sur cette machine.'
  return brut
}

/**
 * Glisse un message dans le tour en cours. Faux s'il n'y a pas de tour, ou
 * s'il se termine : le message partira alors au tour suivant.
 */
export function glisser(projet: string, texte: string, pieces: PieceJointe[] = []): boolean {
  return (
    tours.get(projet)?.glisser({
      type: 'user',
      message: { role: 'user', content: contenu(texte, pieces) },
      parent_tool_use_id: null
    } as SDKUserMessage) ?? false
  )
}

export function repondre(id: string, r: Reponse): void {
  enAttente.get(id)?.(r)
}

/** Arrête le tour d'un projet, ou tous (à la fermeture d'Encre). */
export function arreter(projet?: string): void {
  if (projet) tours.get(projet)?.abort.abort()
  else for (const t of tours.values()) t.abort.abort()
}

/** Change le mode en plein tour, sans attendre le message suivant. */
export async function changerMode(projet: string, mode: Mode): Promise<void> {
  try {
    await tours.get(projet)?.q.setPermissionMode(MODES[mode])
  } catch {
    // Pas de tour en cours : le mode s'appliquera au prochain.
  }
}

/**
 * Les commandes `/` du Claude Code du projet (intégrées, du projet, des
 * plugins). Le SDK ne les donne qu'à une session ouverte : on en ouvre une
 * sans message, le temps de la question, puis on la ferme. Rien n'est
 * envoyé à Claude, donc rien n'est facturé. Gardées par dossier.
 */
const commandesConnues = new Map<string, Commande[]>()
/** Celles qui n'ont de sens que dans un terminal, ou qu'Encre fait déjà autrement (« ＋ » pour /clear). */
const HORS_ENCRE = new Set([
  'exit', 'quit', 'login', 'logout', 'statusline', 'terminal-setup', 'vim', 'ide', 'config', 'theme',
  'resume', 'clear', 'permissions', 'doctor', 'upgrade', 'install-github-app'
])

export async function commandes(projet: Projet): Promise<Commande[]> {
  const deja = commandesConnues.get(projet.dossier)
  if (deja) return deja
  const abort = new AbortController()
  async function* silence(): AsyncGenerator<SDKUserMessage> {
    await new Promise((r) => abort.signal.addEventListener('abort', r))
  }
  const q = query({
    prompt: silence(),
    options: {
      cwd: projet.dossier,
      abortController: abort,
      settingSources: ['user', 'project', 'local'],
      pathToClaudeCodeExecutable: cheminClaude() ?? undefined,
      env: envPropre()
    }
  })
  try {
    const liste = await Promise.race([
      q.supportedCommands(),
      new Promise<never>((_, non) => setTimeout(() => non(new Error('délai dépassé')), 20000))
    ])
    const vues = new Set<string>()
    const propres = liste
      // Les commandes internes (« __… ») et celles que Claude Code marque retirées n'ont rien à faire dans le menu.
      .filter((c) => !c.name.startsWith('_') && !/^\(removed\)/i.test(c.description))
      .filter((c) => !HORS_ENCRE.has(c.name) && !vues.has(c.name) && !!vues.add(c.name))
      .map((c) => ({ nom: c.name, description: c.description, argument: c.argumentHint ?? '' }))
      .sort((a, b) => a.nom.localeCompare(b.nom))
    if (propres.length) commandesConnues.set(projet.dossier, propres)
    return propres
  } catch (e) {
    journal(`commandes : ${String(e)}`)
    return []
  } finally {
    abort.abort()
  }
}

/**
 * Les limites du compte. `rate_limit_event` les donne à chaque appel (part
 * de 0 à 1 dans `unifiedWindows`, champ absent des types du SDK mais bien
 * là, vu le 07/11) ; hors tour, on les demande à une session ouverte sans
 * message (rien n'est envoyé à Claude, comme pour les commandes).
 */
type InfoLimite = {
  status?: string
  rateLimitType?: string
  utilization?: number
  resetsAt?: number
  unifiedWindows?: Record<string, { utilization?: number; resetsAt?: number } | undefined>
}

let connues: Limites | null = null
export const limitesConnues = (): Limites | null => connues
/** Un autre compte : ses limites ne sont pas celles du précédent. */
export const oublierLimites = (): void => {
  connues = null
}

function depuisEvenement(i: InfoLimite): Limites | null {
  const fenetre = (u?: number, r?: number): Fenetre | undefined =>
    typeof u === 'number' ? { pourcent: Math.round(u * 100), reprise: r ? r * 1000 : null } : undefined
  const w = i.unifiedWindows ?? {}
  const l: Limites = { ...connues, atteinte: i.status === 'rejected', lu: Date.now() }
  const cinq = fenetre(w.five_hour?.utilization, w.five_hour?.resetsAt)
  const sept = fenetre(w.seven_day?.utilization, w.seven_day?.resetsAt)
  if (cinq) l.cinqHeures = cinq
  if (sept) l.semaine = sept
  // Une limite atteinte sans pourcentage : la fenêtre en cause est pleine.
  const pleine = { pourcent: 100, reprise: i.resetsAt ? i.resetsAt * 1000 : null }
  if (l.atteinte && i.rateLimitType === 'five_hour' && !cinq) l.cinqHeures = pleine
  if (l.atteinte && i.rateLimitType === 'seven_day' && !sept) l.semaine = pleine
  if (!l.cinqHeures && !l.semaine) return null
  connues = l
  return l
}

let lecture: Promise<Limites | null> | null = null
export function lireLimites(projet: Projet): Promise<Limites | null> {
  if (lecture) return lecture
  lecture = (async () => {
    const abort = new AbortController()
    async function* silence(): AsyncGenerator<SDKUserMessage> {
      await new Promise((r) => abort.signal.addEventListener('abort', r))
    }
    const q = query({
      prompt: silence(),
      options: {
        cwd: projet.dossier,
        abortController: abort,
        pathToClaudeCodeExecutable: cheminClaude() ?? undefined,
        env: envPropre()
      }
    })
    try {
      const u = await Promise.race([
        q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }),
        new Promise<never>((_, non) => setTimeout(() => non(new Error('délai dépassé')), 20000))
      ])
      const r = u.rate_limits
      if (!u.rate_limits_available || !r) return connues
      const fenetre = (f?: { utilization: number | null; resets_at: string | null } | null): Fenetre | undefined =>
        f && typeof f.utilization === 'number'
          ? { pourcent: Math.round(f.utilization), reprise: f.resets_at ? Date.parse(f.resets_at) : null }
          : undefined
      const cinq = fenetre(r.five_hour)
      const sept = fenetre(r.seven_day)
      if (!cinq && !sept) return connues
      connues = { cinqHeures: cinq, semaine: sept, atteinte: (cinq?.pourcent ?? 0) >= 100 || (sept?.pourcent ?? 0) >= 100, lu: Date.now() }
      return connues
    } catch (e) {
      journal(`limites : ${String(e)}`)
      return connues
    } finally {
      abort.abort()
      lecture = null
    }
  })()
  return lecture
}
