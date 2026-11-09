import { app } from 'electron'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { VOIX } from '@shared/types'
import { journal } from './journal'
import type { VoixEleven } from '@shared/types'
import { cleEleven, cleGemini } from './reglages'

/** Repris d'Iris : ce qu'il faut à la voix (la voix choisie, le dossier du projet). */
type Reglages = { voix: string; dossier: string }

/**
 * Débit un peu vif, **hauteur naturelle** : la hauteur relevée d'Iris
 * (+6 %) rendait la voix robotique, et « faisait peur » sur la voix d'enfant.
 */
const DEBIT = '+5%'
const HAUTEUR = '+0%'

const echapper = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Le service gratuit d'Edge n'accepte que `voice` et `prosody` : la balise
 * `<lang>` (qui tiendrait les voix multilingues en français) coupe la
 * synthèse. Testé le 06/11.
 */
function ssml(voix: string, texte: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="fr-FR"><voice name="${voix}"><prosody rate="${DEBIT}" pitch="${HAUTEUR}">${echapper(texte)}</prosody></voice></speak>`
}

const USUELS: [Parameters<typeof app.getPath>[0], string][] = [
  ['downloads', 'Téléchargements'], ['desktop', 'Bureau'], ['documents', 'Documents'],
  ['pictures', 'Images'], ['music', 'Musique'], ['videos', 'Vidéos']
]
function dossiersUsuels(): { nom: string; chemin: string }[] {
  return USUELS.map(([cle, nom]) => {
    try {
      return { nom, chemin: app.getPath(cle) }
    } catch {
      return { nom, chemin: '' }
    }
  }).filter((d) => d.chemin)
}

/**
 * La voix passe par l'endpoint de lecture à voix haute de Microsoft Edge :
 * gratuit, sans clé, et ses voix « multilingues » prononcent correctement les
 * mots anglais semés dans une phrase française. C'est ce point de coût qui
 * avait fait renoncer au projet, ElevenLabs étant hors de prix pour un usage
 * quotidien.
 *
 * On synthétise **phrase par phrase** : attendre la réponse entière avant de
 * parler ajoutait une seconde de silence à chaque échange.
 */

/** Une connexion par voix, gardée ouverte : la poignée de main coûte ~200 ms. */
let tts: MsEdgeTTS | null = null
let voixOuverte = ''

async function connexion(voix: string): Promise<MsEdgeTTS> {
  if (tts && voixOuverte === voix) return tts
  tts?.close()
  const suivant = new MsEdgeTTS()
  await suivant.setMetadata(voix, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  tts = suivant
  voixOuverte = voix
  return suivant
}

/** Le possessif qui va avec chaque dossier usuel, pour qu'une phrase tienne. */
const POSSESSIFS: Record<string, string> = {
  Téléchargements: 'tes Téléchargements',
  Bureau: 'ton Bureau',
  Documents: 'tes Documents',
  Images: 'tes Images',
  Musique: 'ta Musique',
  Vidéos: 'tes Vidéos'
}

/**
 * Remplace les chemins par ce qu'on dirait à voix haute.
 *
 * La consigne l'interdit déjà à l'agent, mais il lui arrive d'écrire un
 * chemin, surtout pour dire qu'il n'a pas accès à quelque chose : la voix
 * lisait alors « C deux points barre oblique Users barre oblique thoma ».
 * `…\Downloads\page.html` devient « page.html dans tes Téléchargements ».
 */
function parlerChemins(texte: string, dossierTravail: string): string {
  const reperes = [
    ...dossiersUsuels().map((d) => ({ chemin: d.chemin, dit: POSSESSIFS[d.nom] ?? d.nom })),
    ...(dossierTravail ? [{ chemin: dossierTravail, dit: 'le projet' }] : [])
  ]
    .map((r) => ({ ...r, chemin: r.chemin.replace(/\//g, '\\').toLowerCase() }))
    // Le plus long d'abord : « Documents\Apps » doit passer avant « Documents ».
    .sort((a, b) => b.chemin.length - a.chemin.length)

  // Les accents graves et les étoiles arrêtent le chemin : un chemin écrit
  // en `code` garderait sinon son accent fermant, et le nettoyage du code ne
  // trouverait plus sa paire.
  // La lettre de lecteur doit être seule : dans « https:// », le « s: » n'en
  // est pas une.
  return texte.replace(/(?<![A-Za-z])[A-Za-z]:[\\/][^\s"'«»,;!?()`*]*/g, (brut) => {
    // Le point qui clôt la phrase a été avalé avec le chemin : on le rend,
    // sinon la voix enchaîne deux phrases sans respirer.
    const fin = brut.match(/[.:]+$/)?.[0] ?? ''
    const chemin = brut.slice(0, brut.length - fin.length).replace(/\//g, '\\')
    const bas = chemin.toLowerCase()
    const repere = reperes.find((r) => bas === r.chemin || bas.startsWith(r.chemin + '\\'))
    const segments = chemin.split('\\').filter(Boolean)
    const dernier = segments[segments.length - 1] ?? ''
    if (!repere) return dernier + fin
    if (bas === repere.chemin) return repere.dit + fin
    // Dans les projets, le nom suffit : Lucas connaît les siens, et « dans
    // carnet dans tes projets » s'entend comme un bégaiement.
    if (repere.dit === 'le projet') return dernier + fin
    return `${dernier} dans ${repere.dit}${fin}`
  })
}

/**
 * Enlève ce qui ne se prononce pas. La consigne demande déjà à l'agent
 * d'éviter listes et code, mais une réponse sur deux contient une étoile ou
 * un accent grave, et la voix lit « astérisque ».
 */
/**
 * Extensions qu'on ne prononce pas : « page.html » se dit « page ». La voix
 * lisait « page point h t m l ».
 */
const EXTENSIONS =
  'html?|css|scss|js|jsx|ts|tsx|mjs|cjs|json|md|txt|py|rs|go|java|cs|php|rb|sh|ps1|bat|exe|dll|log|csv|xlsx?|docx?|pptx?|pdf|png|jpe?g|gif|webp|svg|ico|mp3|mp4|wav|zip|rar|7z|yml|yaml|toml|ini|env|lock'

/**
 * Rend un texte écrit prononçable.
 *
 * La consigne demande déjà à l'agent d'écrire pour l'oreille, mais il lui
 * échappe un smiley, un nom de fichier ou une adresse, et la voix les lit
 * tels quels : « visage souriant », « suite tiret essai point h t m l ».
 * Ce filtre rattrape ce qui reste, sans toucher au texte affiché.
 */
/**
 * Hébergeurs dont le nom ne dit rien : dans `iris-luth.vercel.app`, le site
 * s'appelle « iris luth », pas « vercel ».
 */
const HEBERGEURS = [
  'vercel.app',
  'github.io',
  'netlify.app',
  'pages.dev',
  'web.app',
  'firebaseapp.com',
  'herokuapp.com',
  'onrender.com',
  'notion.site'
]

/**
 * Le nom d'un site, tel qu'on le dit : « youtube », « ton site iris luth ».
 *
 * On garde l'étiquette qui porte le sens — celle d'avant le suffixe — et on
 * jette le reste. Dire l'adresse entière (« api point groq point com ») est
 * exactement ce qui fait bafouiller une voix de synthèse.
 */
function nomDeSite(hote: string): string {
  const bas = hote.toLowerCase().replace(/^www\./, '')
  const heberge = HEBERGEURS.find((h) => bas.endsWith('.' + h))
  // Sans hébergeur connu, on n'enlève que l'extension : tout retirer d'un coup
  // laissait « api » pour `api.groq.com`.
  const reste = heberge ? bas.slice(0, -(heberge.length + 1)) : bas.replace(/\.[a-z]{2,}$/, '')
  const etiquettes = reste.split('.').filter(Boolean)
  // Les sous-domaines de service ne se disent pas : personne n'a besoin
  // d'entendre « api » ni « www ».
  const utiles = etiquettes.filter((e) => e !== 'api' && e !== 'www')
  const nom = (utiles.length ? utiles : etiquettes).slice(-1)[0] ?? bas
  return nom.replace(/[-_]+/g, ' ')
}

export function pourLaVoix(brut: string, dossierTravail = ''): string {
  // Les adresses d'abord : « https://… » ressemble à un chemin (« s:/ »), et
  // le filtre des chemins en gardait le dernier morceau.
  const sansAdresses = brut
    // La ponctuation finale n'appartient pas à l'adresse : sans ce garde-fou,
    // le point de la phrase partait avec elle et la voix enchaînait.
    .replace(/https?:\/\/([a-z0-9.-]+)([^\s)»"']*[^\s)»"'.,;:!?])?/gi, (_m, hote: string) =>
      nomDeSite(hote)
    )
    // Une adresse mail se dit lettre à lettre nulle part : le nom suffit.
    .replace(
      /\b([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})\b/gi,
      (_m, qui: string, hote: string) => `${qui.replace(/[._%+-]+/g, ' ')} chez ${nomDeSite(hote)}`
    )
  return (
    parlerChemins(sansAdresses, dossierTravail)
      // Le code ne se dit pas : un bloc disparaît, un extrait perd ses marques.
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*?([^*]*)\*\*?/g, '$1')
      .replace(/^\s*[-*•]\s+/gm, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Emojis, avec leurs variantes de couleur et leurs assemblages : la
      // voix en lisait le nom officiel.
      .replace(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu, '')
      .replace(/[️‍⃣]/g, '')
      // Les smileys en caractères (« :) », « ^^ », « <3 ») : la voix disait
      // « deux points parenthèse ».
      .replace(/(^|\s)([:;=xX8]-?[)(DPp/\\|*]+|\^\^|\^_\^|<3|xD)(?=\s|$|[.,!?])/g, '$1')
      // Un domaine écrit sans « https » se dit par son nom, comme le reste :
      // « youtube », pas « youtube point com », et surtout pas
      // « api point groq point com ».
      .replace(
        /\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|fr|io|dev|app|org|net|co|ai|me|site|shop|eu|be|ch|ca))\b(\/\S*[^\s.,;:!?])?/gi,
        (_m, hote: string) => nomDeSite(hote)
      )
      // Un fichier se dit sans son extension, et ses tirets sont des espaces.
      .replace(new RegExp(`\\b([\\w-]+)\\.(${EXTENSIONS})\\b`, 'gi'), (_m, nom: string) =>
        nom.replace(/[-_]+/g, ' ')
      )
      // Un numéro de version se dit chiffre par chiffre : laissé tel quel, la
      // voix française lit « zéro virgule trois point un ».
      .replace(/\b(\d+)\.(\d+)\.(\d+)\b/g, '$1 point $2 point $3')
      // Deux nombres séparés d'un point ne font une version que si on le dit :
      // « 1.5 Go » doit rester un nombre.
      .replace(/\b(version\s+|v)(\d+)\.(\d+)\b/gi, '$1$2 point $3')
      // Un raccourci se dit comme on le lit à quelqu'un : « Contrôle, Majuscule
      // et Espace », pas « Ctrl plus Maj plus Espace ».
      .replace(/\b(Ctrl|Control|Cmd|Alt|Shift|Maj|Super|Win)\s*\+\s*/gi, (_m, touche: string) => {
        const dit: Record<string, string> = {
          ctrl: 'Contrôle',
          control: 'Contrôle',
          cmd: 'Commande',
          alt: 'Alt',
          shift: 'Majuscule',
          maj: 'Majuscule',
          super: 'Windows',
          win: 'Windows'
        }
        return `${dit[touche.toLowerCase()] ?? touche} `
      })
      // Symboles : une flèche ou une barre se dit comme une pause, une
      // esperluette comme « et ». Le reste se tait.
      .replace(/\s*(→|⟶|=>|->|—>|\|)\s*/g, ', ')
      .replace(/\s&\s/g, ' et ')
      .replace(/[·•◦▪►▶✓✔✗✘#~^_=<>{}[\]\\]/g, ' ')
      // Seulement devant la virgule et le point qui ferment vraiment : sans le
      // regard en avant, « le fichier .env » devenait « le fichier.env », que
      // la voix lit d'un seul tenant.
      .replace(/\s+([,.])(?=\s|$)/g, '$1')
      .replace(/([,.]){2,}/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function nettoyer(brut: string, dossierTravail: string): string {
  return pourLaVoix(brut, dossierTravail)
}

/** Longueur en dessous de laquelle on préfère attendre la suite. */
const MINI = 14

/**
 * Abréviations et initiales : le point qui les suit n'est pas une fin de
 * phrase. Couper là donnait « M. » prononcé seul, puis une reprise au milieu
 * de la phrase — c'est exactement ce qui s'entend comme un bug.
 */
const ABREGE = /(?:\b[A-ZÉÈÀ]|\betc|\bex|\bp|\bcf|\bM|\bMme|\bDr|\bSt|\bn°|\bno|\bréf|\bvs|\bmin|\bmax|\benv)$/

/**
 * Découpe un tampon en phrases prononçables et rend ce qui reste en attente.
 * Une phrase trop courte est recollée à la suivante : « Oui. » puis « Je
 * regarde. » synthétisés séparément s'entendent comme un hoquet.
 */
export function decouper(tampon: string): { phrases: string[]; reste: string } {
  const phrases: string[] = []
  let courant = ''
  let reste = tampon

  // Les deux-points ne coupent plus : « Deux choses : la première… » est une
  // seule phrase à l'oreille, et la couper y mettait un silence de fin.
  const coupure = /[.!?…]["»)]?\s|\n/

  for (;;) {
    const m = coupure.exec(reste)
    if (!m) break
    const fin = m.index + m[0].length
    const avant = (courant + reste.slice(0, m.index)).trimEnd()
    courant += reste.slice(0, fin)
    reste = reste.slice(fin)
    // Une abréviation ou une initiale : on continue la phrase.
    if (ABREGE.test(avant)) continue
    if (courant.trim().length >= MINI) {
      phrases.push(courant.trim())
      courant = ''
    }
  }

  return { phrases, reste: courant + reste }
}

/**
 * Parle au fil de l'eau.
 *
 * Les morceaux d'audio sont rendus à l'appelant dans l'ordre : c'est le
 * renderer qui les joue, parce que le main n'a pas de sortie audio et qu'une
 * fenêtre sait, elle, interrompre une lecture en cours.
 */
export class Diseur {
  private tampon = ''
  private file: Promise<void> = Promise.resolve()
  private vivant = true
  /** Phrases envoyées à la synthèse et pas encore rendues. */
  private enCours = 0

  constructor(
    private reglages: Reglages,
    private sur: (mp3: Buffer) => void,
    /** Journal : ce qui est réellement prononcé, phrase par phrase. */
    private noter: (ligne: string) => void = () => {}
  ) {}

  /** Ajoute du texte reçu de l'agent et parle ce qui forme des phrases. */
  pousser(delta: string): void {
    if (!this.vivant) return
    this.tampon += delta
    // Gemini gratuit : 3 requêtes par minute. On ne découpe pas en phrases,
    // tout part d'un bloc quand Tako s'arrête de parler (avant un outil, ou à
    // la fin) : une ou deux requêtes par réponse au lieu d'une par phrase.
    if (estGemini(this.reglages.voix)) return
    const { phrases, reste } = decouper(this.tampon)
    this.tampon = reste
    for (const phrase of phrases) this.enfiler(phrase)
  }

  /**
   * Prononce le fond du tampon sans rien clore.
   *
   * À appeler dès que l'agent cesse de parler pour agir : une phrase finie
   * juste avant un outil n'a pas d'espace après son point, donc elle restait
   * en attente, et la phrase suivante s'y collait — « …tes
   * Téléchargements.C'est dans tes Téléchargements… », dit d'un seul souffle.
   */
  finirPhrase(): void {
    if (!this.vivant) return
    const reste = this.tampon.trim()
    this.tampon = ''
    if (reste) this.enfiler(reste)
  }

  /** Prononce le fond du tampon : la réponse est finie. */
  terminer(): void {
    this.finirPhrase()
  }

  /** Coupe : plus rien ne sera synthétisé ni rendu. */
  taire(): void {
    this.vivant = false
    this.tampon = ''
  }

  /** Attend la fin des synthèses déjà lancées. */
  attendre(): Promise<void> {
    return this.file
  }

  /**
   * Il reste des phrases à synthétiser. La file de lecture se vide entre deux
   * phrases dès que la synthèse est plus lente que la voix : ce silence n'est
   * pas la fin de la réponse.
   */
  get occupe(): boolean {
    return this.vivant && this.enCours > 0
  }

  private enfiler(brut: string): void {
    const texte = nettoyer(brut, this.reglages.dossier)
    // Rien à dire s'il ne reste ni lettre ni chiffre : une phrase faite d'un
    // emoji et d'un point devenait « . », que la voix lisait « point ».
    if (!/[\p{L}\p{N}]/u.test(texte)) return
    // Une seule file : les phrases doivent sortir dans l'ordre où elles ont
    // été écrites, et deux synthèses parallèles reviennent dans le désordre.
    this.enCours++
    // Le texte prononcé n'est pas celui qui s'affiche : quand elle « parle
    // mal », c'est ici que ça se voit, pas dans la réponse écrite.
    this.noter(`dit : ${texte.slice(0, 120)}`)
    // Gemini met une à deux secondes par phrase : on lance la synthèse tout
    // de suite (en parallèle) et on rend dans l'ordre. Edge garde sa file
    // unique (une seule connexion, rapide).
    const lancee = estGemini(this.reglages.voix) ? synthetiser(texte, this.reglages).catch(() => Buffer.alloc(0)) : null
    this.file = this.file.then(async () => {
      if (!this.vivant) { this.enCours--; return }
      try {
        const mp3 = await (lancee ?? synthetiser(texte, this.reglages))
        this.enCours--
        if (this.vivant && mp3.length) this.sur(mp3)
      } catch {
        this.enCours--
        // Une phrase muette valait mieux qu'un tour interrompu : la réponse
        // reste lisible à l'écran.
        tts = null
        voixOuverte = ''
      }
    })
  }
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

/**
 * Le modèle TTS de Gemini (documentation lue le 06/11/2026 : API
 * « interactions », audio WAV 24 kHz mono en base64). Flash plutôt que
 * Flash-Lite : Lucas veut d'abord une voix naturelle.
 */
const MODELE_GEMINI = 'gemini-3.8-flash-tts'
/** Le ton de Tako, décrit comme à un comédien (le texte, lui, est lu tel quel). */
const STYLE_TAKO = 'Voix chaleureuse et douce, souriante, un peu espiègle, comme un ami qui parle naturellement, en français, à un rythme de conversation détendu.'

export const estGemini = (voix: string): boolean => voix.startsWith('gemini:')

/** Cherche le premier bloc audio dans la réponse (la forme exacte des `steps` peut bouger). */
function audioDans(x: unknown): string | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (o.type === 'audio' && typeof o.data === 'string') return o.data
  for (const v of Object.values(o)) {
    const r = Array.isArray(v) ? v.map(audioDans).find(Boolean) ?? null : audioDans(v)
    if (r) return r
  }
  return null
}

// ─── ElevenLabs ──────────────────────────────────────────────────────────────

/**
 * Flash v2.5 : la latence la plus basse (fait pour le temps réel), et deux
 * fois moins de crédits par caractère que Multilingual v2 (doc et grilles
 * lues le 09/11/2026). `language_code: fr` le tient en français.
 */
const MODELE_ELEVEN = 'eleven_flash_v2_5'
export const estEleven = (voix: string): boolean => voix.startsWith('eleven:')

/** Plus de crédits ce mois-ci (offre gratuite ou abonnement épuisé). */
export class QuotaEleven extends Error {}

async function eleven(texte: string, voix: string, cle: string): Promise<Buffer> {
  const id = voix.slice('eleven:'.length)
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': cle, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: texte, model_id: MODELE_ELEVEN, language_code: 'fr' }),
    signal: AbortSignal.timeout(20000)
  })
  if (!res.ok) {
    const corps = await res.text()
    if (/quota_exceeded|credits/i.test(corps)) throw new QuotaEleven(`ElevenLabs : crédits épuisés (${res.status})`)
    throw new Error(`ElevenLabs ${res.status} : ${corps.slice(0, 200)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** Les voix du compte (« My Voices » : celles ajoutées depuis la bibliothèque, créées ou clonées). */
export async function voixEleven(cle = cleEleven()): Promise<VoixEleven[]> {
  if (!cle) return []
  const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': cle }, signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(res.status === 401 ? 'ElevenLabs refuse cette clé : vérifie qu’elle a le droit de lire les voix (Voices : Read).' : `ElevenLabs ${res.status}`)
  const j = (await res.json()) as { voices?: { voice_id: string; name: string; category?: string; labels?: Record<string, string> }[] }
  return (j.voices ?? []).map((v) => ({
    id: `eleven:${v.voice_id}`,
    // « Rachel - Calm and warm » : le prénom suffit à l'écran, le reste passe en aide.
    nom: v.name.split(/\s[-–]\s/)[0].trim(),
    aide: v.category === 'premade' ? 'Par défaut' : v.category === 'cloned' ? 'Clonée' : v.category === 'generated' ? 'Créée' : 'Ma voix'
  }))
}

/** Le quota est plein : `apres` = secondes à attendre selon Google. */
/** `apres` = -1 : c'est le quota du jour, il revient à 9 h (minuit heure du Pacifique). */
export class QuotaGemini extends Error {
  constructor(public apres: number) {
    super(apres < 0 ? 'quota Gemini du jour épuisé' : `quota Gemini plein, réessayer dans ${apres} s`)
  }
  get pourLucas(): string {
    return this.apres < 0
      ? 'Quota gratuit du jour épuisé chez Google : la voix revient demain à 9 h.'
      : `Limite gratuite de Gemini : 3 essais par minute. Réessaie dans ${this.apres} s.`
  }
}

async function gemini(texte: string, voix: string, cle: string, essai = 0): Promise<Buffer> {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': cle, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELE_GEMINI,
      input: [{ type: 'user_input', content: [{ type: 'text', text: texte, annotations: [{ type: 'speech_metadata', style: STYLE_TAKO }] }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: voix.slice('gemini:'.length) }] }
    }),
    signal: AbortSignal.timeout(20000)
  })
  if (res.status === 429) {
    const corps = await res.text()
    journal(`Gemini 429 : ${corps.slice(0, 600)}`)
    // Quota du jour (« per day ») : il revient à minuit heure du Pacifique, soit 9 h à Paris.
    if (/per.?day|daily|PerDay/i.test(corps)) throw new QuotaGemini(-1)
    const apres = Number(/retry in (\d+(?:\.\d+)?)s/i.exec(corps)?.[1] ?? 30)
    // Quelques secondes : mieux vaut attendre la bonne voix que changer de voix en pleine réponse.
    if (apres <= 6 && essai === 0) {
      await new Promise((r) => setTimeout(r, apres * 1000 + 300))
      return gemini(texte, voix, cle, 1)
    }
    throw new QuotaGemini(Math.ceil(apres))
  }
  if (!res.ok) throw new Error(`Gemini ${res.status} : ${(await res.text()).slice(0, 200)}`)
  const data = audioDans(await res.json())
  if (!data) throw new Error('Gemini : pas d’audio dans la réponse')
  return Buffer.from(data, 'base64')
}

/**
 * Synthétise une phrase (WAV avec Gemini, MP3 avec Edge). Gemini en panne,
 * sans clé ou au bout de son quota : la voix d'Edge prend le relais, la
 * phrase est dite quand même.
 */
/**
 * Quand Gemini ne peut pas parler (quota gratuit plein, réseau), Tako se
 * tait et la réponse reste écrite : **jamais une autre voix en relais**,
 * l'alternance de deux voix était « ultra perturbante » (Lucas, 06/11).
 */
let surMuet: (secondes: number) => void = () => {}
export function quandMuet(cb: (secondes: number) => void): void {
  surMuet = cb
}

export async function synthetiser(texte: string, reglages: Reglages, { secours = true } = {}): Promise<Buffer> {
  if (estEleven(reglages.voix)) {
    const cle = cleEleven()
    if (!cle) return edge(texte, VOIX[0].id)
    try {
      return await eleven(texte, reglages.voix, cle)
    } catch (e) {
      // Même règle que Gemini : jamais une autre voix en relais, la réponse reste écrite.
      if (!secours) throw e
      journal(`voix ElevenLabs muette : ${String((e as Error).message ?? e).slice(0, 220)}`)
      surMuet(e instanceof QuotaEleven ? -2 : 0)
      return Buffer.alloc(0)
    }
  }
  if (estGemini(reglages.voix)) {
    const cle = cleGemini()
    // Sans clé (retirée), la voix Microsoft revient : c'est un choix, pas un relais.
    if (!cle) return edge(texte, VOIX[0].id)
    try {
      return await gemini(texte, reglages.voix, cle)
    } catch (e) {
      // L'essai des réglages veut connaître l'échec ; la conversation, elle, continue par écrit.
      if (!secours) throw e
      journal(`voix Gemini muette : ${String((e as Error).message ?? e).slice(0, 220)}`)
      surMuet(e instanceof QuotaGemini ? e.apres : 0)
      return Buffer.alloc(0)
    }
  }
  return edge(texte, reglages.voix)
}

/**
 * Crée une voix sur mesure à partir d'une description (« voice design » de
 * Gemini, doc lue le 06/11/2026). Google rend un id permanent `voice_…`
 * (gardé un an après le dernier usage) et un échantillon WAV.
 */
export async function creerVoix(description: string, nom: string): Promise<{ id: string; echantillon: string | null }> {
  const cle = cleGemini()
  if (!cle) throw new Error('Il faut d’abord une clé Gemini.')
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/voices', {
    method: 'POST',
    headers: { 'x-goog-api-key': cle, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store: true,
      voice: { model: MODELE_GEMINI, type: 'prompted', display_name: nom, language_code: 'fr-FR', prompted: { input: description } }
    }),
    signal: AbortSignal.timeout(60000)
  })
  const texte = await res.text()
  if (!res.ok) {
    journal(`création de voix : ${res.status} ${texte.slice(0, 400)}`)
    if (res.status === 429) {
      const apres = Number(/retry in (\d+(?:\.\d+)?)s/i.exec(texte)?.[1] ?? 60)
      throw new QuotaGemini(Math.ceil(apres))
    }
    const message = (() => { try { return String((JSON.parse(texte) as { error?: { message?: string } }).error?.message ?? '') } catch { return '' } })()
    throw new Error(message || `Google a refusé (erreur ${res.status}).`)
  }
  const j = JSON.parse(texte) as Record<string, unknown>
  // L'id peut être à la racine ou dans un sous-objet : on cherche le premier « voice_… ».
  const id = /"(voice_[A-Za-z0-9_-]+)"/.exec(texte)?.[1] ?? String(j.id ?? j.name ?? '')
  if (!id) throw new Error('Google n’a pas renvoyé d’identifiant de voix.')
  const echantillon = /"data"\s*:\s*"([A-Za-z0-9+/=]{200,})"/.exec(texte)?.[1] ?? null
  return { id, echantillon }
}

async function edge(texte: string, voix: string): Promise<Buffer> {
  const client = await connexion(voix)
  const { audioStream } = client.rawToStream(ssml(voix, texte))
  const morceaux: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    audioStream.on('data', (c: Buffer) => morceaux.push(c))
    audioStream.on('end', () => resolve())
    audioStream.on('error', reject)
  })
  return Buffer.concat(morceaux)
}

/**
 * Les phrases d'attente, dites pendant qu'elle réfléchit.
 *
 * Mesuré chez Lucas : cinq secondes et demie en moyenne avant son premier
 * mot, vingt-deux au pire. Un silence de cinq secondes, dans une
 * conversation, c'est très long : un mot suffit à le rendre normal.
 */
export const ATTENTES = ['Je regarde.', 'Deux secondes.', 'J’arrive.', 'Alors…']

/**
 * Les synthétise une fois pour toutes et les garde en mémoire.
 *
 * Elles doivent partir **sans délai** : les fabriquer au moment voulu
 * coûterait précisément ce qu'on cherche à éviter. Refait à chaque changement
 * de voix, de ton ou de débit.
 */
let attentes: { cle: string; mp3: Buffer[] } = { cle: '', mp3: [] }

export async function prechaufferAttentes(reglages: Reglages): Promise<void> {
  const cle = reglages.voix
  // Avec Gemini, pas de phrases d'attente : elles vidaient le quota gratuit
  // (3 requêtes par minute) avant même la première vraie phrase.
  if (estGemini(cle) || estEleven(cle)) {
    attentes = { cle, mp3: [] }
    return
  }
  if (attentes.cle === cle && attentes.mp3.length) return
  try {
    const mp3 = await Promise.all(ATTENTES.map((phrase) => synthetiser(phrase, reglages)))
    attentes = { cle, mp3: mp3.filter((b) => b.length) }
  } catch {
    // Endpoint injoignable : on se passera de la phrase d'attente.
    attentes = { cle: '', mp3: [] }
  }
}

/** Une phrase d'attente prête à jouer, ou `null` si rien n'est prêt. */
export function attentePrete(): Buffer | null {
  if (!attentes.mp3.length) return null
  return attentes.mp3[Math.floor(Math.random() * attentes.mp3.length)]
}

/** Ferme la connexion : appelé à la fermeture de l'application. */
export function fermer(): void {
  tts?.close()
  tts = null
  voixOuverte = ''
}
