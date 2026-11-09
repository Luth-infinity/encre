/**
 * Mettre un texte écrit en français parlé, avant la synthèse.
 *
 * Le modèle Flash d'ElevenLabs ne normalise rien (l'option est réservée aux
 * offres Entreprise) : « 45 min », « 18h30 », « 2e », « API » ou « ≈ 5 k »
 * étaient lus à la lettre, parfois à l'anglaise. On les écrit donc en toutes
 * lettres ici, pour toutes les voix : Edge et Gemini s'en accommodent aussi.
 */

const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
const DIZAINES = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante']

function moinsDeCent(n: number): string {
  if (n <= 16) return UNITES[n]
  // Des espaces, pas de tirets : ElevenLabs lisait « vingt-six » comme « vinci ».
  if (n < 20) return `dix ${UNITES[n - 10]}`
  if (n < 70) {
    const d = Math.floor(n / 10), u = n % 10
    return u === 0 ? DIZAINES[d] : u === 1 ? `${DIZAINES[d]} et un` : `${DIZAINES[d]} ${UNITES[u]}`
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante ${moinsDeCent(n - 60)}`
  if (n === 80) return 'quatre vingts'
  return `quatre vingt ${moinsDeCent(n - 80)}`
}

function moinsDeMille(n: number): string {
  const c = Math.floor(n / 100), r = n % 100
  if (!c) return moinsDeCent(r)
  const cent = c === 1 ? 'cent' : `${UNITES[c]} cent${r ? '' : 's'}`
  return r ? `${cent} ${moinsDeCent(r)}` : cent
}

/** Un entier en toutes lettres (jusqu'à 999 999 999). */
export function enLettres(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) return String(n)
  if (n < 1000) return moinsDeMille(n)
  const millions = Math.floor(n / 1_000_000), milliers = Math.floor((n % 1_000_000) / 1000), reste = n % 1000
  const morceaux: string[] = []
  if (millions) morceaux.push(`${millions === 1 ? 'un' : enLettres(millions)} million${millions > 1 ? 's' : ''}`)
  // « quatre-vingts mille » perd son s, « deux cents mille » aussi.
  if (milliers) morceaux.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers).replace(/s$/, '')} mille`)
  if (reste) morceaux.push(moinsDeMille(reste))
  return morceaux.join(' ')
}

/** « 2 » → « deuxième », « 21 » → « vingt et unième ». */
function ordinal(n: number, feminin = false): string {
  if (n === 1) return feminin ? 'première' : 'premier'
  const m = enLettres(n)
  if (m.endsWith('cinq')) return `${m}uième`
  if (m.endsWith('neuf')) return `${m.slice(0, -1)}vième`
  if (m.endsWith('s')) return `${m.slice(0, -1)}ième`
  if (m.endsWith('e')) return `${m.slice(0, -1)}ième`
  return `${m}ième`
}

/** Le nombre, au féminin quand il se termine par « un » (« une minute », « vingt et une heures »). */
function accorde(n: number, feminin: boolean): string {
  const m = enLettres(n)
  return feminin ? m.replace(/\bun$/, 'une') : m
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** Unités derrière un nombre : [singulier, pluriel, féminin]. */
const UNITES_MESURE: Record<string, [string, string, boolean]> = {
  '%': ['pour cent', 'pour cent', false],
  '€': ['euro', 'euros', false],
  '$': ['dollar', 'dollars', false],
  ms: ['milliseconde', 'millisecondes', true],
  s: ['seconde', 'secondes', true],
  sec: ['seconde', 'secondes', true],
  min: ['minute', 'minutes', true],
  mn: ['minute', 'minutes', true],
  h: ['heure', 'heures', true],
  j: ['jour', 'jours', false],
  ko: ['kilo octet', 'kilo octets', false],
  mo: ['méga', 'mégas', false],
  go: ['giga', 'gigas', false],
  to: ['téra', 'téras', false],
  kb: ['kilo octet', 'kilo octets', false],
  mb: ['méga', 'mégas', false],
  gb: ['giga', 'gigas', false],
  km: ['kilomètre', 'kilomètres', false],
  m: ['mètre', 'mètres', false],
  cm: ['centimètre', 'centimètres', false],
  mm: ['millimètre', 'millimètres', false],
  kg: ['kilo', 'kilos', false],
  g: ['gramme', 'grammes', false],
  px: ['pixel', 'pixels', false],
  fps: ['image par seconde', 'images par seconde', true],
  hz: ['hertz', 'hertz', false],
  '°': ['degré', 'degrés', false],
  '°c': ['degré', 'degrés', false]
}

/** Sigles épelés lettre à lettre, à la française. */
const LETTRES: Record<string, string> = {
  A: 'a', B: 'bé', C: 'cé', D: 'dé', E: 'e', F: 'èf', G: 'gé', H: 'ache', I: 'i', J: 'ji', K: 'ka', L: 'èl', M: 'èm',
  N: 'èn', O: 'o', P: 'pé', Q: 'ku', R: 'èr', S: 'èss', T: 'té', U: 'u', V: 'vé', W: 'double vé', X: 'iks', Y: 'i grec', Z: 'zèd'
}
const EPELES = [
  'API', 'IA', 'UI', 'UX', 'PR', 'CI', 'CSS', 'HTML', 'URL', 'PDF', 'SDK', 'CLI', 'MCP', 'TTS', 'PC', 'USB', 'GPU', 'CPU',
  'SSD', 'DS', 'IP', 'DNS', 'SQL', 'JS', 'TS', 'IDE', 'NPM', 'SMS', 'RGPD', 'PO', 'PM', 'BA', 'SEO', 'CTA', 'KPI', 'FAQ',
  'HTTP', 'HTTPS', 'SSH', 'VPN', 'TV', 'DM', 'RH', 'CV', 'PNG', 'JPG', 'SVG', 'GIF', 'MP3', 'MP4', 'XP', 'PS', 'PV', 'RDV'
]
/** Sigles ou mots qui se disent autrement. */
const DITS: Record<string, string> = {
  OK: 'okay', ok: 'okay', MAJ: 'mise à jour', MAJs: 'mises à jour', JSON: 'jizonne', RAM: 'ramme', ROM: 'romme',
  RDV: 'rendez-vous', SaaS: 'sasse', WiFi: 'wifi', 'Wi-Fi': 'wifi', GitHub: 'guitt heub', iOS: 'aïe ô èss', macOS: 'mac ô èss',
  README: 'ridmi', Node: 'nôde', npm: 'èn pé èm', etc: 'et cetera'
}

const epeler = (sigle: string): string =>
  sigle
    .split('')
    .map((c) => (/\d/.test(c) ? enLettres(Number(c)) : LETTRES[c] ?? c))
    .join(' ')

/** Noms féminins fréquents derrière un nombre. */
const FEMININS = [
  'heures?', 'minutes?', 'secondes?', 'millisecondes?', 'semaines?', 'années?', 'journées?', 'fois', 'pages?', 'lignes?',
  'étapes?', 'versions?', 'sessions?', 'voix', 'apps?', 'applications?', 'personnes?', 'images?', 'fonctions?', 'erreurs?',
  'questions?', 'choses?', 'idées?', 'options?', 'notes?', 'conversations?', 'tâches?', 'sections?', 'colonnes?', 'cartes?',
  'photos?', 'vidéos?', 'phrases?', 'réponses?', 'leçons?', 'releases?', 'branches?', 'clés?', 'touches?', 'fenêtres?'
].join('|')

const NB = String.raw`\d+(?:[.,]\d+)?`

/** Un nombre écrit (« 1,5 », « 0.5 », « 12 ») dit en mots. */
function nombre(brut: string): string {
  const [e, d] = brut.split(/[.,]/)
  const entier = enLettres(Number(e))
  if (d === undefined) return entier
  // « 0,05 » : les zéros de tête se disent, le reste d'un bloc.
  const zeros = d.match(/^0+/)?.[0].length ?? 0
  const decimales = [...Array(zeros).fill('zéro'), ...(d.slice(zeros) ? [enLettres(Number(d.slice(zeros)))] : [])]
  return `${entier} virgule ${decimales.join(' ')}`
}

export function direEnFrancais(texte: string): string {
  let t = texte
    // Milliers séparés par une espace (fine ou insécable) : « 1 000 » est un seul nombre.
    .replace(/\b(\d{1,3})(?:[  ](\d{3}))+\b/g, (m) => m.replace(/[  ]/g, ''))
    // Dates ISO : « 2026-11-09 ».
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, an: string, mo: string, j: string) =>
      Number(mo) >= 1 && Number(mo) <= 12 ? `${Number(j) === 1 ? 'premier' : enLettres(Number(j))} ${MOIS[Number(mo) - 1]} ${enLettres(Number(an))}` : m
    )
    // Abréviations courantes.
    .replace(/\bc\.-à-d\.|\bcàd\b|\bc-à-d\b/gi, "c'est-à-dire")
    .replace(/\betc(\.?)(?=\s|$|[,;:!?)])/gi, 'et cetera$1')
    .replace(/\b(?:ex\.|ex :|p\. ?ex\.?)/gi, 'par exemple')
    .replace(/\bcf\.?(?=\s)/gi, 'voir')
    .replace(/\bvs\.?(?=\s)/gi, 'contre')
    .replace(/\benv\.(?=\s)/gi, 'environ')
    .replace(/\bn°\s*/gi, 'numéro ')
    .replace(/\bqqch\b/gi, 'quelque chose')
    .replace(/\bqqn\b/gi, "quelqu'un")
    .replace(/\bpb\b/gi, 'problème')
    .replace(/\bauj\.?(?=\s)/gi, "aujourd'hui")
    .replace(/[≈~∼]\s*(?=\d)/g, 'environ ')
    .replace(/\s≈\s/g, ' environ ')
    // Heures : « 18h30 », « 9 h », « 1h ».
    .replace(/\b(\d{1,2})\s?h\s?(\d{2})\b/g, (_m, h: string, mn: string) => `${accorde(Number(h), true)} heure${Number(h) > 1 ? 's' : ''} ${enLettres(Number(mn))}`)
    // Dates : « 09/11 », « 9/11/2026 », « le 3/4 » — seulement quand c'est plausible.
    .replace(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g, (m, j: string, mo: string, an?: string) => {
      const jour = Number(j), mois = Number(mo)
      const date = jour >= 1 && jour <= 31 && mois >= 1 && mois <= 12 && (an || j.length === 2 || mo.length === 2)
      if (!date) return `${j} sur ${mo}`
      return `${jour === 1 ? 'premier' : enLettres(jour)} ${MOIS[mois - 1]}${an ? ` ${enLettres(Number(an))}` : ''}`
    })
    // Ordinaux : « 1er », « 1re », « 2e », « 3ème », « XXe » non (chiffres seulement).
    .replace(/\b(\d+)(?:er|ers)\b/g, (_m, n: string) => ordinal(Number(n)))
    .replace(/\b(\d+)(?:re|res|ère|ères)\b/g, (_m, n: string) => ordinal(Number(n), true))
    .replace(/\b(\d+)(?:e|es|ème|èmes|nd|nde)\b/g, (_m, n: string) => ordinal(Number(n)))
    // Intervalles : « 3-4 jours », « 10–20 % ».
    .replace(new RegExp(String.raw`\b(${NB})\s?[-–—]\s?(${NB})\b`, 'g'), '$1 à $2')
    // Multiplicateurs : « x2 », « ×3 ».
    .replace(/(^|\s)[x×]\s?(\d+)\b/g, (_m, a: string, n: string) => `${a}fois ${enLettres(Number(n))}`)
    .replace(/\b(\d+)\s?[x×](?=\s|$|[,.;!?])/g, (_m, n: string) => `${enLettres(Number(n))} fois`)
    // Signes devant un nombre.
    .replace(/(^|[\s(])\+\s?(?=\d)/g, '$1plus ')
    .replace(/(^|[\s(])[−-](?=\d)/g, '$1moins ')
    .replace(/\s\+\s/g, ' plus ')
    // « 40 k », « 5k€ » : des milliers.
    .replace(new RegExp(String.raw`\b(${NB})\s?k(?=\s?€|\s?\$|\b)`, 'g'), (_m, n: string) => `${nombre(n)} mille`)

  // Nombre + unité.
  t = t.replace(new RegExp(String.raw`(?<![\w.,])(${NB})\s?(%|€|\$|°C|°|[A-Za-z]{1,3})(?![\wÀ-ÿ])`, 'g'), (m, n: string, u: string) => {
    const unite = UNITES_MESURE[u.toLowerCase()] ?? (u === 'm' ? UNITES_MESURE.m : undefined)
    if (!unite) return m
    // « Mo » / « m » : on ne prend « m » pour des mètres qu'en minuscule.
    if (u === 'M' || u === 'S' || u === 'H') return m
    const [sing, plur, fem] = unite
    const valeur = Number(n.replace(',', '.'))
    const dit = /[.,]/.test(n) ? nombre(n) : accorde(valeur, fem)
    return `${dit} ${valeur >= 2 || /[.,]/.test(n) ? plur : sing}`
  })

  // Sigles et mots spéciaux.
  t = t.replace(/\b[A-Za-z][A-Za-z0-9-]*\b/g, (mot) => {
    if (DITS[mot]) return DITS[mot]
    if (EPELES.includes(mot)) return epeler(mot)
    // Pluriel d'un sigle : « les PR », « des APIs ».
    if (mot.endsWith('s') && EPELES.includes(mot.slice(0, -1))) return epeler(mot.slice(0, -1))
    return mot
  })

  // Barre oblique entre deux mots : « Windows/Mac » → « Windows ou Mac ».
  t = t.replace(/(?<![\w/])([A-Za-zÀ-ÿ]+)\/([A-Za-zÀ-ÿ]+)(?![\w/])/g, '$1 ou $2')

  // Un nombre devant un nom féminin s'accorde : « une seconde », « vingt et une heures ».
  t = t.replace(new RegExp(String.raw`(?<![\w.,])(\d+)(?=\s(?:${FEMININS})\b)`, 'gi'), (_m, n: string) => accorde(Number(n), true))

  // Tous les nombres restants.
  t = t.replace(new RegExp(String.raw`(?<![\w.,])${NB}(?![\w])`, 'g'), (n) => (/^\d{5,}$/.test(n) && n.length > 9 ? n : nombre(n)))
  return t
}
