import { useEffect, useState, type ReactNode } from 'react'
import { avatarDe, type Etat, type Mode, type Projet } from '@shared/types'
import { Chevron } from './icones'
import { portrait } from './poulpe2d'
import { MODELES } from './Reglages'

export const MODES: { id: Mode; nom: string; aide: string }[] = [
  { id: 'demander', nom: 'Demander', aide: 'Chaque action t’est demandée avant d’être faite.' },
  { id: 'modifs', nom: 'Modifs auto', aide: 'Les fichiers se modifient seuls, les commandes te sont demandées.' },
  { id: 'auto', nom: 'Tout auto', aide: 'Le mode auto de Claude Code : il ne demande que quand il hésite.' }
]

/** Plus courtes que dans les Réglages : le menu doit se lire d'un coup d'œil. */
const AIDES_MODELE: Record<string, string> = {
  auto: 'Sonnet pour le simple, Opus quand il faut réfléchir.',
  sonnet: 'Rapide, et plus léger pour tes limites.',
  opus: 'Le plus fort, et le plus gourmand.',
  claude: 'Celui réglé dans Claude Code (/model).'
}

type Option = { id: string; nom: string; aide?: string; image?: string; desactive?: boolean }

/**
 * Un choix de la réglette : une étiquette discrète, et un menu qui s'ouvre
 * vers le haut (le champ est en bas du panneau), calé sur toute la largeur
 * de la réglette pour ne jamais sortir du panneau (le menu du compte était
 * coupé quand il pendait sous l'en-tête, 27/11).
 */
function Choix({ nom, etiquette, image, titre, section, options, actuel, choisir, note, ouvert, basculer }: {
  nom: string
  etiquette: ReactNode
  image?: string
  titre: string
  section: string
  options: Option[]
  actuel: string
  choisir: (id: string) => void
  note?: ReactNode
  ouvert: boolean
  basculer: () => void
}): JSX.Element {
  return (
    <div className="choix-bas" data-choix={nom}>
      <button type="button" className={`puce-bas ${ouvert ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={ouvert} title={titre} onClick={basculer}>
        {image && <img className="pastille" src={image} alt="" />}
        {etiquette && <span className="etiquette-bas">{etiquette}</span>}
        <Chevron haut={ouvert} />
      </button>
      {ouvert && (
        <div className="menu-bas" role="menu">
          <small className="section">{section}</small>
          {options.map((o) => (
            <button key={o.id} type="button" role="menuitemradio" aria-checked={o.id === actuel} disabled={o.desactive}
              className={o.id === actuel ? 'on' : ''} onClick={() => choisir(o.id)}>
              {o.image && <img className="pastille" src={o.image} alt="" />}
              <span className="texte"><strong>{o.nom}</strong>{o.aide && <small>{o.aide}</small>}</span>
              {o.id === actuel && <span className="coche" aria-hidden>✓</span>}
            </button>
          ))}
          {note && <small className="note">{note}</small>}
        </div>
      )}
    </div>
  )
}

const k = (n: number): string => `${Math.max(1, Math.round(n / 1000))} k`

/**
 * Sous le champ, ce qui règle la prochaine demande, à portée de main :
 * le compte qui paie, ce que Tako peut faire seul, le modèle, et les limites.
 * Avant (27/11), modes et limites étaient dans le ⋯, le modèle dans les
 * Réglages et le compte dans l'en-tête : « on doit aller sur un autre écran ».
 */
export default function Reglette({ etat, projet, avatarNom, plein, jauges }: {
  etat: Etat
  projet: Projet
  avatarNom: string
  plein: boolean
  jauges: ReactNode
}): JSX.Element {
  const [ouvert, setOuvert] = useState<string | null>(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: PointerEvent): void => { if (!(e.target as Element).closest(`[data-choix="${ouvert}"]`)) setOuvert(null) }
    // Échap ferme le menu, pas le panneau.
    const echap = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setOuvert(null) } }
    addEventListener('pointerdown', dehors)
    addEventListener('keydown', echap, true)
    return () => { removeEventListener('pointerdown', dehors); removeEventListener('keydown', echap, true) }
  }, [ouvert])
  const basculer = (nom: string) => (): void => setOuvert((o) => (o === nom ? null : nom))
  const prendre = (f: () => void): void => { setOuvert(null); f() }

  const compte = etat.comptes.find((c) => c.actif)
  const mode = MODES.find((m) => m.id === projet.mode) ?? MODES[0]
  const modele = MODELES.find(([id]) => id === etat.reglages.modele) ?? MODELES[0]
  // « Auto » seul se confondait avec « Tout auto » juste à côté.
  const etiquetteModele = modele[0] === 'auto' ? 'Modèle auto' : modele[1]

  return (
    <div className="reglette">
      {compte && etat.comptes.length > 1 && (
        <Choix
          nom="compte" ouvert={ouvert === 'compte'} basculer={basculer('compte')}
          image={portrait(avatarDe(compte.avatar).espece)}
          // En petit, la pastille de l'avatar suffit : la place va aux limites.
          etiquette={plein ? compte.nom : null}
          titre={`Compte Claude : ${compte.nom}${compte.email ? ` (${compte.email})` : ''}. Cliquer pour changer.`}
          section={projet.libre ? 'Compte en cours' : 'Compte de ce projet'}
          options={etat.comptes.map((c) => ({ id: c.id, nom: c.nom, aide: c.connecte ? c.offre ?? c.email ?? '' : 'À connecter dans Réglages', image: portrait(avatarDe(c.avatar).espece), desactive: !c.connecte }))}
          actuel={compte.id}
          choisir={(id) => prendre(() => { if (id !== compte.id) window.api.choisirCompte(id) })}
          // Un fil déjà long : l'autre compte ne l'a pas en cache, il sera relu en entier.
          note={!!projet.contexte && projet.contexte > 20000 ? `Changer de compte : cette conversation (${k(projet.contexte)}) sera relue en entier au prochain message.` : undefined}
        />
      )}
      <Choix
        nom="mode" ouvert={ouvert === 'mode'} basculer={basculer('mode')}
        etiquette={mode.nom}
        titre={`Ce que ${avatarNom} peut faire seul : ${mode.nom}`}
        section={`Ce que ${avatarNom} peut faire seul`}
        options={MODES}
        actuel={mode.id}
        choisir={(id) => prendre(() => window.api.mode(id as Mode))}
      />
      <Choix
        nom="modele" ouvert={ouvert === 'modele'} basculer={basculer('modele')}
        etiquette={etiquetteModele}
        titre={`Modèle : ${modele[1]}`}
        section="Modèle, pour toutes les conversations"
        options={MODELES.map(([id, nom]) => ({ id, nom, aide: AIDES_MODELE[id] }))}
        actuel={modele[0]}
        choisir={(id) => prendre(() => window.api.reglages({ modele: id as (typeof MODELES)[number][0] }))}
      />
      <span className="espace" />
      {jauges}
    </div>
  )
}
