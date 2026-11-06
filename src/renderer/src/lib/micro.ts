/**
 * Le micro du mode Parler. Le principe vient d'Iris : on enregistre, on
 * s'arrête tout seul après un silence, et le son part chez Groq (par le main,
 * qui garde la clé).
 */

/** Ouvre le micro choisi, ou celui du système (signature reprise d'Iris pour la veille). */
export async function flux(peripherique: string, options: MediaTrackConstraints = {}, surRepli?: () => void): Promise<MediaStream> {
  if (peripherique) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { ...options, deviceId: { exact: peripherique } } })
    } catch (err) {
      const nom = String((err as Error)?.name || '')
      if (nom !== 'OverconstrainedError' && nom !== 'NotFoundError') throw err
      surRepli?.()
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: Object.keys(options).length ? options : true })
}

/** Au-dessus : quelqu'un parle. Repris de la veille d'Iris, un peu plus haut (micro ouvert près de la bouche). */
const SEUIL = 0.02
/**
 * Silence après la parole qui clôt la demande. À 1,4 s, une hésitation
 * (« Non mais… ») partait comme une demande entière : on laisse le temps
 * de chercher ses mots.
 */
const FIN_SILENCE = 2300
/** Il faut au moins ça de voix pour que ce soit une phrase, et pas un bruit (que Whisper transformerait en texte inventé). */
const PAROLE_MIN = 400
/** Mains libres, sans un mot dans ce délai, on referme. */
const ATTENTE_DEBUT = 10000
const MAX = 180_000

export type Ecoute = {
  /** Le niveau du micro (0 à 1), pour animer le poulpe et l'anneau. */
  niveau: () => number
  /** Pendant une pause après avoir parlé : de 0 (on vient de se taire) à 1 (ça part). */
  pause: () => number
  /** Arrête tout de suite et rend ce qui a été dit. */
  finir: () => void
  /** Abandonne : rien n'est rendu. */
  annuler: () => void
  /** Le son enregistré, ou `null` si personne n'a parlé ou si on a annulé. */
  resultat: Promise<Blob | null>
}

/**
 * `auto` : l'écoute se ferme seule après un silence (réveil au mot). Sinon,
 * comme dans VoiceType, c'est l'appui suivant qui envoie : on peut chercher
 * ses mots aussi longtemps qu'on veut.
 */
export async function ecouter({ auto }: { auto: boolean }): Promise<Ecoute> {
  const stream = await flux('', { echoCancellation: true, noiseSuppression: true })
  const ctx = new AudioContext()
  const analyseur = ctx.createAnalyser()
  analyseur.fftSize = 1024
  ctx.createMediaStreamSource(stream).connect(analyseur)
  const tampon = new Float32Array(analyseur.fftSize)

  const enregistreur = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
  const morceaux: Blob[] = []
  enregistreur.ondataavailable = (e) => e.data.size && morceaux.push(e.data)

  let niveau = 0
  let aParle = false
  let voix = 0
  let pause = 0
  let dernierSon = Date.now()
  const debut = Date.now()
  let annule = false
  let rendre: (b: Blob | null) => void = () => {}
  const resultat = new Promise<Blob | null>((r) => (rendre = r))

  const fermer = (): void => {
    clearInterval(boucle)
    if (enregistreur.state !== 'inactive') enregistreur.stop()
  }
  enregistreur.onstop = () => {
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close().catch(() => {})
    rendre(annule || !aParle || !morceaux.length ? null : new Blob(morceaux, { type: 'audio/webm' }))
  }

  const boucle = setInterval(() => {
    analyseur.getFloatTimeDomainData(tampon)
    let somme = 0
    for (const v of tampon) somme += v * v
    const rms = Math.sqrt(somme / tampon.length)
    niveau = Math.min(1, rms * 12)
    const maintenant = Date.now()
    if (rms > SEUIL) {
      voix += 60
      if (voix >= PAROLE_MIN) aParle = true
      dernierSon = maintenant
    }
    pause = auto && aParle ? Math.min(1, Math.max(0, (maintenant - dernierSon - 300) / (FIN_SILENCE - 300))) : 0
    if (auto && aParle && maintenant - dernierSon > FIN_SILENCE) fermer()
    else if (auto && !aParle && maintenant - debut > ATTENTE_DEBUT) fermer()
    else if (maintenant - debut > MAX) fermer()
  }, 60)

  enregistreur.start(250)
  return {
    niveau: () => niveau,
    pause: () => pause,
    // Envoyer à la main vaut parole, même à voix basse ; un appui sans un mot n'envoie rien.
    finir: () => {
      aParle = aParle || voix >= 180
      fermer()
    },
    annuler: () => {
      annule = true
      fermer()
    },
    resultat
  }
}
