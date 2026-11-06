import { useEffect, useRef, useState } from 'react'
import { estCloture, lireDemande } from './commandes'
import { FileLecture } from './lecture'
import { ecouter, type Ecoute } from './micro'

/**
 * Le moteur du mode Parler : écouter, transcrire, envoyer, dire la réponse,
 * puis rouvrir le micro quelques secondes pour enchaîner (comme Iris).
 * Il vit dans le panneau et pas dans la vue Parler : la réponse continue de
 * se dire si on repasse au chat pendant qu'elle parle.
 */

export type Phase = 'pret' | 'ecoute' | 'transcrit' | 'attend' | 'parle'

export type Parole = {
  phase: Phase
  erreur: string | null
  /** Ce que Lucas vient de dire, le temps qu'il parte. */
  entendu: string
  niveau: () => number
  lancer: () => void
  finir: () => void
  annuler: () => void
  /** Coupe la voix (la réponse continue de s'écrire). */
  taire: () => void
}

export function useParole(suite: boolean): Parole {
  const [phase, setPhase] = useState<Phase>('pret')
  const [erreur, setErreur] = useState<string | null>(null)
  const [entendu, setEntendu] = useState('')
  const ecoute = useRef<Ecoute | null>(null)
  const lecture = useRef<FileLecture | null>(null)
  /** Le tour en cours a été lancé à la voix : lui seul rouvre le micro après. */
  const tourVocal = useRef(false)
  const tourFini = useRef(true)
  const suiteRef = useRef(suite)
  suiteRef.current = suite
  const lancerRef = useRef<(enSuite?: boolean) => void>(() => {})

  /** Fin de la réponse (texte fini et voix tue) : on rend la main, ou on réécoute. */
  const apres = (): void => {
    if (!tourFini.current || lecture.current?.enLecture) return
    const rouvrir = tourVocal.current && suiteRef.current
    tourVocal.current = false
    setPhase('pret')
    window.api.ecoute(false)
    if (rouvrir) lancerRef.current(true)
  }

  useEffect(() => {
    lecture.current = new FileLecture(() => apres())
    const offs = [
      window.api.surAudio((mp3) => {
        // La voix d'une réponse écrite au clavier ne se dit pas : seule une question dite appelle une réponse dite.
        if (!tourVocal.current) return
        lecture.current?.ajouter(mp3)
        setPhase('parle')
      }),
      window.api.surTourFini(() => {
        tourFini.current = true
        apres()
      })
    ]
    return () => {
      offs.forEach((o) => o())
      lecture.current?.taire()
      ecoute.current?.annuler()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lancer = async (enSuite = false): Promise<void> => {
    if (ecoute.current) return
    lecture.current?.taire()
    setErreur(null)
    setEntendu('')
    let e: Ecoute
    try {
      e = await ecouter(enSuite)
    } catch (err) {
      const nom = String((err as Error)?.name || '')
      setErreur(nom === 'NotAllowedError' ? 'Accès au micro refusé : Windows → Confidentialité → Microphone.' : 'Aucun micro disponible.')
      setPhase('pret')
      return
    }
    ecoute.current = e
    setPhase('ecoute')
    window.api.ecoute(true)
    const son = await e.resultat
    ecoute.current = null
    window.api.ecoute(false)
    if (!son) return setPhase('pret')
    setPhase('transcrit')
    const r = await window.api.transcrire(await son.arrayBuffer())
    if (r.erreur) {
      setErreur(r.erreur)
      return setPhase('pret')
    }
    const demande = lireDemande(r.texte ?? '')
    // « Merci, c'est parfait » ferme l'échange : ce n'est pas une demande.
    if (!demande || estCloture(demande)) return setPhase('pret')
    setEntendu(demande)
    tourVocal.current = true
    tourFini.current = false
    setPhase('attend')
    window.api.envoyer(demande, [], true)
  }
  lancerRef.current = (s) => void lancer(s)

  return {
    phase,
    erreur,
    entendu,
    niveau: () => ecoute.current?.niveau() ?? 0,
    lancer: () => void lancer(false),
    finir: () => ecoute.current?.finir(),
    annuler: () => ecoute.current?.annuler(),
    taire: () => {
      lecture.current?.taire()
      tourVocal.current = false
      setPhase(tourFini.current ? 'pret' : 'attend')
    }
  }
}
