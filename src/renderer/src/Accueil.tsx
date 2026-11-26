import { useEffect, useRef } from 'react'
import type { Avatar, Etat, Humeur, Projet } from '@shared/types'
import { creerPoulpe } from './poulpe'
import { creerPoulpe2D, type Pose } from './poulpe2d'

/**
 * Le fil vide (piste D, validée le 24/11) : une question et le champ, rien à ranger.
 * Dans Libre, on écrit et Tako range la demande dans le bon projet.
 */
export default function Accueil(): JSX.Element {
  // Le projet visé s'affiche sous le champ (puce « Dans … », Panneau.tsx), pas sous le titre.
  return (
    <div className="accueil">
      <h1>Qu’est-ce qu’on fait ?</h1>
    </div>
  )
}

/**
 * Sous le champ : ce qui t'attend ailleurs (une ligne par projet), seulement s'il y en a.
 * Sinon, dans Libre, de quoi reprendre les deux derniers projets d'un clic.
 */
export function EnAttente({ etat, projet, ouvrir, palette, raccourci }: { etat: Etat; projet: Projet; ouvrir: (id: string) => void; palette: () => void; raccourci: string }): JSX.Element | null {
  const nomDe = (p: Projet): string => (p.libre ? 'Libre' : p.nom)
  const racineDe = (p: Projet): Projet | undefined => (p.parent ? etat.projets.find((x) => x.id === p.parent) : undefined)
  const vivants = etat.projets.filter((p) => p.id !== projet.id && (etat.attend.includes(p.id) || etat.enCours.includes(p.id)))
  if (vivants.length) {
    return (
      <div className="en-attente">
        {vivants.map((p) => {
          const attend = etat.attend.includes(p.id)
          return (
            <button key={p.id} type="button" className="ligne" onClick={() => ouvrir(p.id)}>
              <i className={`activite ${attend ? 'attend' : 'travaille'}`} />
              <b>{nomDe(p)}</b>
              {racineDe(p) && <span className="ou">{racineDe(p)!.nom}</span>}
              <span className="ou">{attend ? 'attend ton accord' : 'travaille'}</span>
              {attend && <span className="voir">Voir</span>}
            </button>
          )
        })}
      </div>
    )
  }
  if (!projet.libre) return null
  const recents = etat.projets.filter((p) => !p.libre).sort((a, b) => b.derniere - a.derniere).slice(0, 2)
  return (
    <p className="reprendre">
      {recents.length > 0 && <>Reprendre : {recents.map((p, i) => <span key={p.id}>{i > 0 && ' · '}<button type="button" onClick={() => ouvrir(p.id)}>{p.nom}</button></span>)} · </>}
      <button type="button" onClick={palette}><kbd>{raccourci}</kbd> tous les projets</button>
    </p>
  )
}

/**
 * Le compagnon derrière le contenu. Le poulpe est en 2D (forme noire, visage cartoon) :
 * « coin », il monte du coin bas droit de l'accueil ; « guetteur », sa tête dépasse du champ.
 * Les autres avatars (Nori, Momo) gardent leur rendu 3D en attendant leur version 2D.
 */
export function Creature({ avatar, humeur, pose }: { avatar: Avatar; humeur: Humeur; pose: Pose }): JSX.Element | null {
  const cv = useRef<HTMLCanvasElement>(null)
  const vivant = useRef<{ humeur(h: Humeur): void; detruire(): void } | null>(null)
  const deuxD = avatar.espece === 'poulpe'
  useEffect(() => {
    if (!cv.current) return
    vivant.current = deuxD
      ? creerPoulpe2D(cv.current, pose, humeur)
      : creerPoulpe(cv.current, { remplir: 0.86, espece: avatar.espece, peau: avatar.peau, motif: avatar.motif })
    return () => vivant.current?.detruire()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar, pose])
  useEffect(() => vivant.current?.humeur(humeur), [humeur, avatar, pose])
  if (!deuxD && pose === 'guetteur') return null
  return <canvas ref={cv} className={`creature ${pose} ${deuxD ? 'deux-d' : ''}`} aria-hidden />
}
