import {
  createSdkMcpServer, query, tool, type EffortLevel, type PermissionMode, type PermissionResult, type Query, type SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import type { Commande, Diff, Evenement, Fenetre, Humeur, Limites, Mode, Outil, PieceJointe, Projet, Reponse } from '@shared/types'
import { cheminClaude, noterConnexion } from './claude'
import { avatarActif, dossierActif } from './comptes'
import * as fils from './fils'
import { journal } from './journal'
import { CATALOGUE, connecterOutil, envDuProjet, serveursDuProjet } from './outils'
import * as projets from './projets'
import { reglages } from './reglages'
import { eteindre, MODELES, trier } from './tri'
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
 * mon client, la refonte du site »). Le tour en cours reste dans son dossier : le projet
 * ouvert prend la main au message suivant.
 */
function outilsEncre(sortie: Sortie, projetDuTour?: string): ReturnType<typeof createSdkMcpServer> {
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
        texte(JSON.stringify(projets.projets().map((p) => ({ id: p.id, nom: p.nom, dossier: p.dossier, sujetDe: p.parent, actif: p.id === projets.actifId() })), null, 2))
      ),
      tool(
        'connecter_outil',
        `Connecte un outil externe (serveur MCP) à Claude Code : ouvre une fenêtre qui l’ajoute si besoin puis lance la connexion dans le navigateur de l’utilisateur. À appeler dès qu’un outil manque ou demande une connexion (état needs-auth, « not authenticated »), au lieu de l’envoyer vers un terminal. Outils connus : ${CATALOGUE.map((c) => `${c.nom} (${c.titre})`).join(', ')}. Pour un autre, donne l’adresse de son serveur MCP. L’outil est utilisable au message suivant, une fois la connexion acceptée.`,
        {
          nom: z.string().describe('Nom de l’outil, par exemple « notion »'),
          adresse: z.string().optional().describe('Adresse du serveur MCP, seulement pour un outil hors de la liste')
        },
        async ({ nom, adresse }) => {
          const actuel = projets.trouver(projetDuTour ?? '') ?? projets.actif()
          const dossier = actuel && !actuel.libre ? projets.racineDe(actuel).dossier : projets.racine()
          const s = connecterOutil(nom, dossier, adresse)
          if (!s) return texte(`Je ne connais pas l’adresse de « ${nom} » : demande-la à l’utilisateur (le serveur MCP officiel de l’outil), puis rappelle connecter_outil avec.`)
          sortie.evenement({ type: 'info', texte: `Connexion à ${s} ouverte` })
          return texte(`Une fenêtre s’est ouverte pour connecter « ${s} ». Dis à l’utilisateur de se connecter et d’accepter dans son navigateur, puis de t’écrire « c’est bon » : l’outil sera disponible au message suivant. Arrête-toi là.`)
        }
      ),
      tool(
        'creer_sujet',
        'Ouvre un nouveau sujet dans le projet en cours : même dossier et mêmes outils, mais une conversation neuve. À utiliser quand l’utilisateur passe à un autre ticket ou un autre chantier, pour ne pas empiler (chaque action relit toute la conversation). Encre y relance sa demande aussitôt.',
        { nom: z.string().describe('Nom court, par exemple « Ticket 142 » ou « Page tarifs »') },
        async ({ nom }) => {
          const actuel = projets.trouver(projetDuTour ?? '') ?? projets.actif()
          if (!actuel || actuel.libre) return texte('Pas de sujet dans Libre : crée ou ouvre d’abord un projet.')
          const s = projets.creerSujet(actuel.id, nom)
          if (!s) return texte('Impossible de créer ce sujet.')
          ouvrir(s.id, `Sujet ${s.nom} ouvert`)
          fils.noter(s.id, { type: 'info', texte: `Sujet ouvert depuis « ${actuel.nom} »` })
          return texte(`Sujet « ${s.nom} » ouvert. Dis-le en une phrase et arrête-toi : Encre y relance la demande.`)
        }
      ),
      tool(
        'creer_projet',
        'Crée un projet Encre quand l’utilisateur veut travailler sur un client ou un sujet précis. Sans `dossier`, Encre crée Documents/Encre/Projets/<nom> avec un CLAUDE.md qui porte `contexte`. Avec `dossier` (un dossier existant), Encre le lie tel quel. Le projet s’ouvre au message suivant.',
        {
          nom: z.string().describe('Nom court et lisible, par exemple « Client · Refonte du site »'),
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

const OUTILS_ENCRE = ['mcp__encre__lister_projets', 'mcp__encre__creer_projet', 'mcp__encre__ouvrir_projet', 'mcp__encre__creer_sujet', 'mcp__encre__connecter_outil']

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

/** « claude-opus-5-5 » → « Opus 5.5 », pour dire sous la réponse qui a répondu. */
export function nomModele(id: string): string {
  const m = /(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?/i.exec(id)
  if (!m) return id
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] && m[3].length < 3 ? `.${m[3]}` : ''}`
}

/**
 * Au-delà, un fil est « long ». Chaque modèle a son propre cache : changer de
 * modèle dans un long fil fait réécrire tout l'historique au prix fort
 * (doc Claude Code, prompt caching), ce qui coûte plus que le modèle moins
 * cher ne fait gagner. Changer l'effort, lui, garde le cache (modèles 5.5).
 */
const FIL_LONG = 40_000
/** Le cache d'un abonnement dure une heure : passé ce délai, il n'y a plus rien à protéger. */
const CACHE = 55 * 60_000

type Choix = { modele?: string; effort?: EffortLevel }

/**
 * Le modèle du tour : celui des réglages, ou trié selon la demande. Fil neuf,
 * court ou refroidi : le tri choisit librement. Long fil encore en cache : on
 * garde Opus et une demande simple baisse seulement l'effort ; monter de
 * Sonnet à Opus reste permis (mieux vaut payer le cache qu'une réponse à côté).
 */
async function choisirModele(projet: Projet, texte: string, pieces: number, chaud: boolean): Promise<Choix> {
  const choix = reglages().modele
  if (choix === 'claude') return {}
  if (choix !== 'auto') return { modele: choix }
  const avant = projet.niveau ?? null
  // La réponse précédente aide Haiku à voir si la demande poursuit un travail en cours.
  const derniere = [...fils.fil(projet.id)].reverse().find((b) => b.type === 'ia')
  const n = await trier(texte, pieces, avant, derniere?.type === 'ia' ? derniere.texte : null, envPropre())
  if (chaud && avant === 'costaud' && n === 'rapide') {
    journal(`modèle de ${projet.nom} : opus gardé (fil de ${Math.round((projet.contexte ?? 0) / 1000)} k), effort moyen`)
    return { modele: MODELES.costaud, effort: 'medium' }
  }
  projets.modifier(projet.id, { niveau: n })
  journal(`modèle de ${projet.nom} : ${MODELES[n]}${chaud ? ' (fil long)' : ''}`)
  return { modele: MODELES[n] }
}

/**
 * Ce qu'un appel a coûté, en « tokens au prix d'une entrée » : un token relu
 * en cache compte un dixième, un token mis en cache 1,25, un token écrit 5
 * (rapports de prix de l'API). Une estimation pour comparer les tours entre
 * eux, pas la facture. Compté message par message : le `modelUsage` du
 * résultat cumule toute la session reprise (vu le 09/11), pas le seul tour.
 */
type Usage = Record<string, number | null> | undefined
function cout(u: Usage): number {
  if (!u) return 0
  return Math.round((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1 + (u.output_tokens ?? 0) * 5)
}
/** Somme des appels d'un tour : un même message revient plusieurs fois dans le flux, compté une fois. */
const total = (couts: Map<string, number>): number => [...couts.values()].reduce((a, b) => a + b, 0)

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

const ESPECES = { poulpe: 'le poulpe', meduse: 'la méduse', axolotl: 'l’axolotl' }

/**
 * La consigne vocale part **dans le message**, pas dans la consigne système :
 * Claude Code n'applique pas une consigne système changée à la reprise d'une
 * session (doc « prompt caching »), donc elle sautait dès le 2e message.
 */
const CONSIGNE_VOIX = [
  '(Mode Parler pour ce message : ta réponse est lue à voix haute. Écris pour l’oreille : phrases courtes, aucune liste, aucun tableau, aucun code, aucun chemin de fichier, pas d’emoji. Deux à quatre phrases suffisent, sauf si on te demande plus. Tu peux quand même agir avec tes outils.',
  // Un lien épelé (« encre-app point vercel point app ») était illisible à l'écran :
  // en lien Markdown, il est cliquable dans le fil et la voix n'en lit que le texte.
  'Si tu donnes un lien, écris-le en lien Markdown avec un texte court, par exemple [le site](https://…) : il sera cliquable à l’écran, et la voix ne lira que le texte. N’épelle jamais une adresse.)'
].join(' ')

/** Les notes de reprise d'un projet (écrites par Claude quand Encre range une session). */
export const cheminNotes = (id: string): string => join(app.getPath('userData'), 'notes', `${id}.md`)
function notes(projet: Projet, max = 12000): string {
  if (projet.libre) return ''
  try {
    return readFileSync(cheminNotes(projet.id), 'utf-8').slice(0, max).trim()
  } catch {
    return ''
  }
}

function consigne(projet: Projet): string {
  const a = avatarActif()
  // Les notes ne servent qu'à une session neuve : une session reprise a déjà tout.
  const n = projet.session ? '' : notes(projet)
  const racine = projets.racineDe(projet)
  // Un sujet neuf repart aussi des notes du projet, en plus court : le contexte général sans tout l'historique.
  const np = projet.session || racine === projet ? '' : notes(racine, 5000)
  return [
    `Tu es ${a.nom}, ${ESPECES[a.espece]} d’Encre : une bulle qui flotte sur le bureau de l’utilisateur et ouvre ce chat. Si on te demande ton nom, c’est ${a.nom}. Ton ton est ${a.ton}.`,
    'Réponds en français, court et concret. Avant chaque étape, une phrase courte qui dit ce que tu fais.',
    // Le fil rend le Markdown (titres, tableaux, cases, citations, images) : les réponses en texte brut faisaient « pas quali » (10/11).
    'Mets en forme quand ça aide à lire : un titre court pour une réponse longue, un tableau pour comparer, une liste de cases (- [ ] / - [x]) pour un plan ou des étapes à suivre, du gras pour l’essentiel, une citation (>) pour un extrait. Quand tu trouves des images (recherche, capture, fichier), montre-les avec ![description](adresse ou chemin du fichier) plutôt que de donner le lien seul. Une réponse simple reste un paragraphe.',
    // Notion « pas connecté » finissait en « ouvre un terminal et tape claude mcp » (12/11) : Encre sait le faire.
    'Si un outil externe (Notion, Linear, Jira, un serveur MCP) manque ou demande une connexion, n’envoie jamais l’utilisateur vers un terminal ni vers /mcp : appelle connecter_outil, qui ouvre la connexion pour lui.',
    'À la fin, dis ce que tu as changé en une à trois phrases. Pas de tiret cadratin au milieu d’une phrase.',
    // Les suggestions de réponse : Encre retire cette ligne du texte et de la voix et en fait des boutons.
    'Termine chaque réponse par une dernière ligne <suites>…</suites> contenant trois choses que l’utilisateur pourrait te répondre ensuite, séparées par | : écrites à sa place, à la première personne, courtes (deux à huit mots), utiles pour la suite (par exemple <suites>Publie et installe | Montre-moi le résultat | Explique le souci</suites>). Rien après cette ligne, et ne la mentionne jamais.',
    '',
    projet.libre
      ? 'Mode Libre : un brouillon qui repart à vide à chaque visite. Une question rapide (une info, une explication, une formulation) se traite ici, sans projet. Mais dès que l’utilisateur veut FAIRE quelque chose qui demande du travail ou un suivi (« j’aimerais faire tel truc », un client, un sujet, une app, un document à produire), ne commence pas le travail ici : regarde lister_projets, ouvre le projet s’il existe (ouvrir_projet), sinon crée-le tout de suite sans lui demander (creer_projet) avec un nom court et tout le contexte qu’il t’a donné. Dis-lui en une phrase que tu t’y mets dans ce projet, et arrête-toi : Encre y déplace la conversation et t’y relance aussitôt.'
      : racine !== projet
        ? `Projet ouvert : « ${racine.nom} » (${projet.dossier}), sujet « ${projet.nom} ». Ce sujet a sa propre conversation : reste dessus. Pour changer de projet ou ouvrir un autre sujet, utilise les outils encre.`
        : `Projet ouvert : « ${projet.nom} » (${projet.dossier}). Pour changer de projet ou en créer un, utilise les outils encre.`,
    ...(projet.libre ? [] : [
      // Chaque action relit toute la conversation : séparer les sujets et garder les gros résultats hors du fil, c'est ce qui coûte le moins.
      'Économise le fil : si l’utilisateur passe à un autre ticket ou un chantier sans rapport avec la conversation en cours (et qu’elle a déjà du contenu), ouvre un sujet avec creer_sujet au lieu d’empiler, dis-le en une phrase et arrête-toi. Pour une exploration large (chercher dans beaucoup de fichiers, lire de longues pages ou documentations), passe par un sous-agent (outil Agent) qui te rend seulement l’essentiel. Lis les gros fichiers par morceaux.'
    ]),
    ...(np ? ['', `Les notes du projet « ${racine.nom} » (contexte général, d’autres sujets) :`, np] : []),
    ...(n ? ['', `Tes notes de reprise, écrites à la fin de la session précédente sur ce ${racine !== projet ? 'sujet' : 'projet'} (c’est là qu’on en était) :`, n] : [])
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
  clearTimeout(minuteurs.get(projet.id))
  // Encre range la session de ce projet en ce moment : on attend ses notes.
  const rangement = rangements.get(projet.id)
  if (rangement) {
    sortie.humeur('reflechit')
    await rangement
    projet = projets.trouver(projet.id) ?? projet
  }
  const abort = new AbortController()
  const debut = Date.now()
  sortie.humeur('reflechit')
  const chaud = !!projet.session && (projet.contexte ?? 0) > FIL_LONG && debut - projet.derniere < CACHE
  projets.modifier(projet.id, { derniere: debut })
  // Le tri tourne pendant que Claude Code démarre (2 à 3 s) : il ne retarde presque rien.
  const modele = choisirModele(projet, texte, options.pieces?.length ?? 0, chaud).catch((): Choix => ({}))
  let modeleVu: string | undefined
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
    // Le modèle se pose juste avant le premier message, une fois le tri rendu.
    const c = await modele
    if (c.modele) await q.setModel(c.modele).catch((e) => journal(`modèle ${c.modele} refusé : ${String(e)}`))
    if (c.effort) await q.applyFlagSettings({ effortLevel: c.effort }).catch((e) => journal(`effort ${c.effort} refusé : ${String(e)}`))
    yield {
      type: 'user',
      message: { role: 'user', content: contenu(diseur ? `${CONSIGNE_VOIX}\n\n${texte}` : texte, options.pieces ?? []) },
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
  const filtre = new FiltreSuites()

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
      env: { ...envPropre(), ...envDuProjet(projets.racineDe(projet)) },
      mcpServers: { ...serveursDuProjet(projets.racineDe(projet)), encre: outilsEncre(sortie, projet.id) },
      allowedTools: OUTILS_ENCRE,
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
  /** Taille du fil au dernier appel, et coût estimé du tour (voir `cout`). */
  let tailleFil = 0
  const couts = new Map<string, number>()
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
        modeleVu = m.model
        projets.modifier(projet.id, {
          session: m.session_id,
          modeleVu: m.model,
          serveurs: m.mcp_servers.filter((s) => s.name !== 'encre').map((s) => ({ nom: s.name, etat: s.status }))
        })
      } else if (m.type === 'stream_event' && !m.parent_tool_use_id) {
        const ev = m.event
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          const propre = filtre.pousser(ev.delta.text)
          if (propre) {
            sortie.evenement({ type: 'texte', texte: propre })
            diseur?.pousser(propre)
          }
        }
      }
      // Tous les appels comptent, sous-agents compris ; la taille du fil, seulement le fil principal.
      if (m.type === 'assistant') couts.set(m.message.id, cout(m.message.usage as unknown as Usage))
      if (m.type === 'assistant' && !m.parent_tool_use_id) {
        const u = m.message.usage as unknown as Usage
        if (u) tailleFil = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0)
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
  const reste = filtre.finir()
  if (reste) sortie.evenement({ type: 'texte', texte: reste })
  if (tailleFil) projets.modifier(projet.id, { contexte: tailleFil })
  const coutTour = total(couts)
  journal(`tour ${projet.nom} : fil ${Math.round(tailleFil / 1000)} k, coût ≈ ${Math.round(coutTour / 1000)} k${modeleVu ? `, ${modeleVu}` : ''}`)
  sortie.evenement({
    type: 'fin', erreur, duree: Date.now() - debut, suites: filtre.suites.length ? filtre.suites : undefined, modele: modeleVu && nomModele(modeleVu),
    fil: tailleFil || undefined, cout: coutTour || undefined
  })
  sortie.humeur(erreur ? 'repos' : 'fini')
  if (!erreur && !abort.signal.aborted) programmerRangement(projet.id)
  // La voix n'a pas forcément fini : avec Gemini, la réponse part d'un bloc
  // après le texte. Le tour n'est fini (« tour-fini », micro rendu) qu'une
  // fois le dernier son envoyé au panneau, sinon il se perdait.
  if (diseur && !abort.signal.aborted) await diseur.attendre()
}

/**
 * Ranger une session (idée de Lucas, 09/11) : un projet laissé 45 min sans
 * message, Claude écrit ses notes de reprise et la session est lâchée. Au
 * message suivant, une session neuve repart de ces notes (dans la consigne)
 * au lieu de relire un historique de 600 000 tokens à chaque action.
 * 45 min et pas plus : le cache d'un abonnement dure une heure, les notes
 * coûtent donc une relecture en cache (un dixième du prix).
 */
const RANGER_APRES = 45 * 60_000
/** En dessous, la session est assez légère pour être reprise telle quelle. */
const RANGER_DES = 15_000
/**
 * Au-delà, la session est rangée dès la fin du tour, sans attendre 45 min :
 * une matinée de travail sans pause est montée à 746 k relus à chaque action
 * (10/11), et le rangement au repos ne venait jamais. Le cache est chaud, les
 * notes coûtent un dixième d'une relecture.
 */
const RANGER_TAILLE = Number(process.env.ENCRE_RANGER_TAILLE) || 200_000
const minuteurs = new Map<string, ReturnType<typeof setTimeout>>()
const rangements = new Map<string, Promise<void>>()
/** Le main montre Tako qui écrit pendant un rangement (humeur `note`). */
let surRangement: (projet: string, enCours: boolean) => void = () => {}
export function quandRange(cb: (projet: string, enCours: boolean) => void): void {
  surRangement = cb
}

function lancerRangement(id: string, session: string | null): boolean {
  const q = projets.trouver(id)
  if (!q || q.libre || !q.session || q.session !== (session ?? q.session) || tours.has(id) || rangements.has(id)) return false
  surRangement(id, true)
  rangements.set(
    id,
    ranger(q)
      .catch((e) => journal(`rangement de ${q.nom} impossible : ${String(e)}`))
      .finally(() => {
        rangements.delete(id)
        surRangement(id, false)
      })
  )
  return true
}

function programmerRangement(id: string): void {
  clearTimeout(minuteurs.get(id))
  const p = projets.trouver(id)
  if (!p || p.libre || !p.session || (p.contexte ?? 0) < RANGER_DES) return
  const session = p.session
  // Un fil lourd est rangé presque tout de suite (quelques secondes laissent
  // passer un message glissé juste après la fin du tour).
  const lourd = (p.contexte ?? 0) >= RANGER_TAILLE
  if (lourd) journal(`rangement de ${p.nom} : fil de ${Math.round((p.contexte ?? 0) / 1000)} k, rangé dès maintenant`)
  minuteurs.set(
    id,
    setTimeout(() => {
      minuteurs.delete(id)
      lancerRangement(id, session)
    }, lourd ? 4000 : Number(process.env.ENCRE_RANGER_APRES) || RANGER_APRES)
  )
}

/** « Ranger maintenant » sous une réponse : la même chose, à la demande. */
export function rangerMaintenant(id: string): boolean {
  clearTimeout(minuteurs.get(id))
  minuteurs.delete(id)
  return lancerRangement(id, null)
}

const DEMANDE_NOTES = [
  'Encre range cette session : la prochaine fois, tu repartiras de zéro avec seulement les notes que tu écris maintenant.',
  'Écris tes notes de reprise de ce projet, en Markdown et en français, 60 lignes au plus : le but et pour qui, où on en est, les décisions prises et pourquoi, ce qui reste à faire, les pièges rencontrés, les fichiers et commandes utiles. Garde ce qui compte encore dans tes notes précédentes s’il y en avait. Ne recopie ni tes consignes (ton, style, format des réponses) ni de données personnelles : elles reviennent seules.',
  'N’utilise aucun outil. Réponds uniquement avec les notes, sans phrase autour et sans ligne <suites>.'
].join('\n')

async function ranger(projet: Projet): Promise<void> {
  const debut = Date.now()
  const abort = new AbortController()
  const delai = setTimeout(() => abort.abort(), 3 * 60_000)
  let fini: () => void = () => {}
  const attente = new Promise<void>((r) => (fini = r))
  // L'entrée reste ouverte jusqu'au résultat (entrée en flux, comme un tour).
  async function* entree(): AsyncGenerator<SDKUserMessage> {
    yield { type: 'user', message: { role: 'user', content: DEMANDE_NOTES }, parent_tool_use_id: null } as SDKUserMessage
    await attente
  }
  // Les mêmes réglages que les tours (dossier, consigne, outils, modèle) : le
  // début de la requête est identique, l'historique se relit depuis le cache.
  const q = query({
    prompt: entree(),
    options: {
      cwd: projet.dossier,
      resume: projet.session ?? undefined,
      abortController: abort,
      permissionMode: MODES[projet.mode],
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: consigne(projet) },
      pathToClaudeCodeExecutable: cheminClaude() ?? undefined,
      env: { ...envPropre(), ...envDuProjet(projets.racineDe(projet)) },
      mcpServers: { ...serveursDuProjet(projets.racineDe(projet)), encre: outilsEncre({ evenement: () => {}, humeur: () => {} }) },
      allowedTools: OUTILS_ENCRE,
      model: projet.modeleVu,
      canUseTool: async (): Promise<PermissionResult> => ({ behavior: 'deny', message: 'Pas d’outil : écris seulement les notes.' })
    }
  })
  let texteNotes = ''
  const couts = new Map<string, number>()
  try {
    for await (const m of q) {
      if (m.type === 'assistant') couts.set(m.message.id, cout(m.message.usage as unknown as Usage))
      if (m.type !== 'result') continue
      if (m.subtype === 'success' && !m.is_error) texteNotes = m.result.replace(/<suites>[\s\S]*?<\/suites>/g, '').trim()
      fini()
    }
  } finally {
    fini()
    clearTimeout(delai)
  }
  // Pas de notes valables : la session reste, rien n'est perdu.
  if (texteNotes.length < 80) return journal(`rangement de ${projet.nom} : notes vides, session gardée`)
  mkdirSync(join(app.getPath('userData'), 'notes'), { recursive: true })
  writeFileSync(cheminNotes(projet.id), `${texteNotes}\n`, 'utf-8')
  projets.modifier(projet.id, { session: null, contexte: 0 })
  journal(`rangement de ${projet.nom} : notes écrites (${texteNotes.length} car.), session lâchée, coût ≈ ${Math.round(total(couts) / 1000)} k, ${Math.round((Date.now() - debut) / 1000)} s`)
}

/**
 * Retire la ligne `<suites>…</suites>` du texte en flux, morceau par morceau :
 * la balise peut arriver coupée en deux (« <sui » puis « tes> »), donc la fin
 * d'un morceau qui pourrait en être le début est gardée jusqu'au suivant.
 */
class FiltreSuites {
  suites: string[] = []
  private retenu = ''
  private dedans = false
  private contenu = ''

  pousser(morceau: string): string {
    let t = this.retenu + morceau
    this.retenu = ''
    let sortie = ''
    while (t) {
      if (this.dedans) {
        const fin = t.indexOf('</suites>')
        if (fin < 0) {
          // La balise de fin peut, elle aussi, arriver coupée.
          const lt = t.lastIndexOf('<')
          if (lt >= 0 && '</suites>'.startsWith(t.slice(lt))) {
            this.retenu = t.slice(lt)
            t = t.slice(0, lt)
          }
          this.contenu += t
          return sortie
        }
        this.contenu += t.slice(0, fin)
        this.lire()
        this.dedans = false
        t = t.slice(fin + '</suites>'.length)
        continue
      }
      const debut = t.indexOf('<suites>')
      if (debut >= 0) {
        sortie += t.slice(0, debut)
        this.dedans = true
        t = t.slice(debut + '<suites>'.length)
        continue
      }
      // Un « < » en fin de morceau qui pourrait ouvrir la balise : on attend la suite.
      const lt = t.lastIndexOf('<')
      if (lt >= 0 && '<suites>'.startsWith(t.slice(lt))) {
        this.retenu = t.slice(lt)
        t = t.slice(0, lt)
      }
      sortie += t
      t = ''
    }
    return sortie
  }

  /** Fin du tour : une balise jamais fermée compte quand même, un « < » retenu repart dans le texte. */
  finir(): string {
    if (this.dedans) this.lire()
    this.dedans = false
    const r = this.retenu
    this.retenu = ''
    return r
  }

  private lire(): void {
    const s = this.contenu.split('|').map((x) => x.trim()).filter((x) => x && x.length <= 80)
    if (s.length) this.suites = s.slice(0, 3)
    this.contenu = ''
  }
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
  if (projet) return void tours.get(projet)?.abort.abort()
  for (const t of tours.values()) t.abort.abort()
  eteindre()
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
