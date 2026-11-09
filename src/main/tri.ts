import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { Niveau } from '@shared/types'
import { cheminClaude } from './claude'
import { journal } from './journal'

/**
 * Le tri des demandes : Sonnet pour ce qui est simple, Opus pour ce qui
 * demande de réfléchir. Les cas évidents se décident ici sans appel ; Haiku
 * ne tranche que les autres, en un mot. Dans le doute (Haiku lent, absent,
 * réponse bizarre), c'est Opus : mieux vaut une réponse lente qu'une réponse
 * à côté. Le tri tourne pendant que le Claude Code du tour démarre
 * (`agent.ts` pose le modèle juste avant le premier message).
 */

export const MODELES: Record<Niveau, string> = { rapide: 'sonnet', costaud: 'opus' }

/** « ok », « vas-y », « continue » : la suite du même travail, sur le même modèle. */
const SUITE = /^(ok|oui|non|vas[- ]y|go|continue|on continue|d['’]accord|parfait|top|super|merci|c['’]est bon|fais[- ]le|valide|publie|lance)\b/i

/** Ce qui se décide sans appel ; null = à demander à Haiku. */
export function regle(texte: string, pieces: number, precedent: Niveau | null): Niveau | null {
  const t = texte.trim()
  if (precedent && t.length <= 60 && SUITE.test(t)) return precedent
  if (pieces > 0 || t.length > 600) return 'costaud'
  return null
}

const CONSIGNE = [
  'Tu tries les demandes faites à un assistant de travail (code, documents, projets).',
  'Tu ne traites jamais la demande toi-même : tu réponds par un seul mot, SIMPLE ou COMPLEXE.',
  'SIMPLE : la réponse tient en quelques phrases ou une petite action précise. Question de connaissance, définition, explication courte, traduction, reformulation, calcul, conseil rapide, petite retouche d’un seul endroit, conversation.',
  'COMPLEXE : il faut chercher, réfléchir longtemps ou agir en plusieurs étapes. Écrire ou modifier du code (sauf une ligne), déboguer, concevoir, refondre, analyser un dossier ou un long document, rédiger un document complet, planifier.',
  'Exemples. « Explique ce qu’est un DNS » : SIMPLE. « Traduis ce mail en anglais » : SIMPLE. « Change le titre de la page en Bienvenue » : SIMPLE. « Pourquoi le build plante ? » : COMPLEXE. « Ajoute un mode sombre » : COMPLEXE. « Fais-moi une proposition commerciale » : COMPLEXE.',
  'Si la demande poursuit un gros travail en cours, COMPLEXE.'
].join('\n')

/**
 * Un Haiku démarré d'avance, qui attend sa demande : lancer Claude Code prend
 * 2 à 3 s, la réponse de Haiku moins d'une seconde de plus. Un trieur ne sert
 * qu'une fois (contexte vierge) ; le suivant démarre aussitôt derrière.
 */
type Trieur = { donner: (texte: string) => void; mot: Promise<string>; abort: AbortController; compte: string | undefined; vivant: () => boolean }
let pret: Trieur | null = null

function lancer(env: Record<string, string>): Trieur {
  const abort = new AbortController()
  let donner: (texte: string) => void = () => {}
  const demande = new Promise<string>((r) => (donner = r))
  async function* entree(): AsyncGenerator<SDKUserMessage> {
    yield { type: 'user', message: { role: 'user', content: await demande }, parent_tool_use_id: null } as SDKUserMessage
  }
  const q = query({
    prompt: entree(),
    options: {
      model: 'haiku',
      systemPrompt: CONSIGNE,
      // Rien à charger, rien à garder : juste un mot, le plus vite possible.
      tools: [],
      settingSources: [],
      persistSession: false,
      maxTurns: 1,
      thinking: { type: 'disabled' },
      abortController: abort,
      pathToClaudeCodeExecutable: cheminClaude() ?? undefined,
      env
    }
  })
  let fini = false
  const mot = (async (): Promise<string> => {
    for await (const m of q) if (m.type === 'result') return m.subtype === 'success' ? m.result.trim().toUpperCase() : ''
    return ''
  })().finally(() => (fini = true))
  // Coupé au repos (changement de compte, fermeture) : personne n'attend la réponse.
  mot.catch(() => {})
  return { donner, mot, abort, compte: env.CLAUDE_CONFIG_DIR, vivant: () => !fini }
}

/** À la fermeture d'Encre : le trieur qui attendait s'arrête. */
export function eteindre(): void {
  pret?.abort.abort()
  pret = null
}

export async function trier(texte: string, pieces: number, precedent: Niveau | null, avant: string | null, env: Record<string, string>): Promise<Niveau> {
  const vite = regle(texte, pieces, precedent)
  if (vite) return vite
  // Le trieur prêt, s'il est encore là et sur le bon compte ; sinon un neuf.
  const t = pret && pret.vivant() && pret.compte === env.CLAUDE_CONFIG_DIR ? pret : (eteindre(), lancer(env))
  pret = null
  const delai = setTimeout(() => t.abort.abort(), 6000)
  const debut = Date.now()
  try {
    const contexte = avant ? `Fin de la réponse précédente de l’assistant :\n${avant.slice(-400)}\n\n` : ''
    t.donner(`${contexte}Demande à classer :\n${texte.slice(0, 2000)}`)
    const mot = await t.mot
    journal(`tri : ${mot || 'vide'} en ${Date.now() - debut} ms`)
    // Le mot où qu'il soit : Haiku ajoute parfois un point ou une phrase.
    return /\bSIMPLE\b/.test(mot) && !/\bCOMPLEXE\b/.test(mot) ? 'rapide' : 'costaud'
  } catch (e) {
    journal(`tri impossible (${t.abort.signal.aborted ? 'plus de 6 s' : String(e)}) : Opus`)
    return 'costaud'
  } finally {
    clearTimeout(delai)
    pret = lancer(env)
  }
}
