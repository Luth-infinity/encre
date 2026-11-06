import { useEffect, useRef, useState } from 'react'
import { bipEnvoye, bipOuvert } from './bip'
import { estCloture, lireDemande } from './commandes'
import { FileLecture } from './lecture'
import { ecouter, type Ecoute } from './micro'

/**
 * Parler à Encre comme on dicte avec VoiceType, mais c'est Claude qui répond :
 * Alt+Maj+E (ou le micro du chat) ouvre l'écoute, on parle aussi longtemps
 * qu'on veut, on re-appuie pour envoyer, Échap annule. La demande et la
 * réponse s'écrivent dans le fil, et la réponse se dit à voix haute — même
 * panneau fermé : le poulpe de la bulle suffit.
 *
 * Seul le réveil au mot « Encre » termine l'écoute sur un silence : là, on a
 * les mains libres et rien sur quoi appuyer.
 */

export type Phase = 'ecoute' | 'transcrit' | 'attend' | 'parle'

export type Parole = {
  /** Un échange à la voix est en cours (de l'écoute jusqu'à la fin de la réponse dite). */
  actif: boolean
  phase: Phase
  /** L'écoute se termine sur un silence (réveil au mot), sinon sur un appui. */
  mainsLibres: boolean
  erreur: string | null
  /** Niveau du micro (0 à 1). */
  niveau: () => number
  /** Mains libres : de 0 à 1 pendant le silence qui précède l'envoi. */
  pause: () => number
  /** Le geste unique, comme VoiceType : ouvre l'écoute, ou envoie si elle est ouverte. */
  basculer: (mainsLibres?: boolean) => void
  /** Échap : abandonne l'écoute, ou fait taire la réponse. */
  annuler: () => void
}

export function useParole(): Parole {
  const [actif, setActif] = useState(false)
  const [phase, setPhase] = useState<Phase>('ecoute')
  const [mainsLibres, setMainsLibres] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const phaseRef = useRef<Phase | null>(null)
  const ecoute = useRef<Ecoute | null>(null)
  const lecture = useRef<FileLecture | null>(null)
  /** Le tour en cours vient de la voix : lui seul se dit à voix haute. */
  const tourVocal = useRef(false)
  const tourFini = useRef(true)

  const poser = (p: Phase | null): void => {
    phaseRef.current = p
    setActif(p !== null)
    if (p) setPhase(p)
  }

  /** Réponse écrite et dite jusqu'au bout : l'échange est fini, la saisie revient. */
  const finir = (): void => {
    if (!tourVocal.current || !tourFini.current || lecture.current?.enLecture || ecoute.current) return
    tourVocal.current = false
    poser(null)
  }

  useEffect(() => {
    lecture.current = new FileLecture(() => finir())
    const offs = [
      window.api.surAudio((mp3) => {
        if (!tourVocal.current) return
        lecture.current?.ajouter(mp3)
        poser('parle')
      }),
      window.api.surTourFini(() => {
        tourFini.current = true
        finir()
      })
    ]
    return () => {
      offs.forEach((o) => o())
      ecoute.current?.annuler()
      lecture.current?.taire()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ouvrir = async (libres: boolean): Promise<void> => {
    if (ecoute.current) return
    // Reprendre la parole coupe la voix (le texte, lui, finit de s'écrire).
    lecture.current?.taire()
    tourVocal.current = false
    setErreur(null)
    setMainsLibres(libres)
    let e: Ecoute
    try {
      e = await ecouter({ auto: libres })
    } catch (err) {
      const nom = String((err as Error)?.name || '')
      setErreur(nom === 'NotAllowedError' ? 'Accès au micro refusé : Windows → Confidentialité → Microphone.' : 'Aucun micro disponible.')
      return poser(null)
    }
    ecoute.current = e
    poser('ecoute')
    bipOuvert()
    window.api.ecoute(true)
    const son = await e.resultat
    ecoute.current = null
    window.api.ecoute(false)
    if (!son) return poser(null)
    bipEnvoye()
    poser('transcrit')
    const r = await window.api.transcrire(await son.arrayBuffer())
    // Annulé pendant la transcription : la réponse arrive trop tard, on l'oublie.
    if (phaseRef.current !== 'transcrit') return
    if (r.erreur) {
      setErreur(r.erreur)
      return poser(null)
    }
    const demande = lireDemande(r.texte ?? '')
    if (!demande || estCloture(demande)) return poser(null)
    tourVocal.current = true
    tourFini.current = false
    poser('attend')
    window.api.envoyer(demande, [], true)
  }

  return {
    actif,
    phase,
    mainsLibres,
    erreur,
    niveau: () => (phaseRef.current === 'ecoute' ? ecoute.current?.niveau() ?? 0 : 0),
    pause: () => (phaseRef.current === 'ecoute' ? ecoute.current?.pause() ?? 0 : 0),
    basculer: (libres = false) => {
      if (phaseRef.current === 'ecoute') ecoute.current?.finir()
      else if (phaseRef.current !== 'transcrit') void ouvrir(libres)
    },
    annuler: () => {
      if (phaseRef.current === 'ecoute') ecoute.current?.annuler()
      else if (phaseRef.current) {
        // La voix se tait ; la réponse, elle, finit de s'écrire dans le fil.
        lecture.current?.taire()
        tourVocal.current = false
        poser(null)
      }
    }
  }
}
