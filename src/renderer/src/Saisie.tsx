import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Commande, PieceJointe } from '@shared/types'
import { Micro, Trombone } from './icones'

/** Les images partent telles quelles à Claude ; au-delà, mieux vaut le chemin. */
const IMAGES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const IMAGE_MAX = 4.5 * 1024 * 1024

function base64(f: Blob): Promise<string> {
  return new Promise((ok, non) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).replace(/^data:[^,]+,/, ''))
    r.onerror = () => non(r.error)
    r.readAsDataURL(f)
  })
}

export async function versPiece(f: File): Promise<PieceJointe | null> {
  const chemin = (() => {
    try {
      return window.api.cheminFichier(f) || undefined
    } catch {
      return undefined
    }
  })()
  if (IMAGES.includes(f.type) && f.size <= IMAGE_MAX) {
    return { nom: f.name || 'capture.png', chemin, image: { media: f.type, donnees: await base64(f) } }
  }
  return chemin ? { nom: f.name, chemin } : null
}

export type SaisieRef = { ajouter: (p: PieceJointe[]) => void; focus: () => void }

type Props = {
  enCours: boolean
  envoyer: (texte: string, pieces: PieceJointe[]) => void
  arreter: () => void
  /** Ouvre la conversation à la voix (le bouton micro, quand rien n'est écrit). */
  parler: () => void
  /** Change à chaque projet : les commandes `/` dépendent du dossier. */
  projet: string
}

/**
 * La zone de saisie : texte, pièces jointes (glisser, coller, trombone) et
 * menu des commandes `/` dès qu'on tape une barre oblique en début de message.
 */
export const Saisie = forwardRef<SaisieRef, Props>(function Saisie({ enCours, envoyer, arreter, parler, projet }, ref) {
  const [texte, setTexte] = useState('')
  const [pieces, setPieces] = useState<PieceJointe[]>([])
  const [commandes, setCommandes] = useState<Commande[] | null>(null)
  const [choix, setChoix] = useState(0)
  const zone = useRef<HTMLTextAreaElement>(null)
  const fichier = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    ajouter: (p) => setPieces((x) => [...x, ...p]),
    focus: () => zone.current?.focus()
  }))

  // Un autre projet, d'autres commandes : on les redemandera.
  useEffect(() => setCommandes(null), [projet])

  const motif = /^\/(\S*)$/.exec(texte)
  const menuOuvert = !!motif
  useEffect(() => {
    if (menuOuvert && commandes === null) void window.api.commandes().then(setCommandes)
  }, [menuOuvert, commandes])
  const filtre = motif ? (commandes ?? []).filter((c) => c.nom.toLowerCase().startsWith(motif[1].toLowerCase())).slice(0, 8) : []
  useEffect(() => setChoix(0), [texte])

  const prendre = (c: Commande): void => {
    setTexte(`/${c.nom} `)
    zone.current?.focus()
  }

  const partir = (): void => {
    const t = texte.trim()
    if ((!t && !pieces.length) || enCours) return
    envoyer(t, pieces)
    setTexte('')
    setPieces([])
  }

  const touche = (e: React.KeyboardEvent): void => {
    if (menuOuvert && filtre.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setChoix((choix + 1) % filtre.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setChoix((choix - 1 + filtre.length) % filtre.length); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && filtre[choix] && `/${filtre[choix].nom}` !== texte.trim())) {
        e.preventDefault()
        prendre(filtre[choix])
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      partir()
    }
  }

  const coller = async (e: React.ClipboardEvent): Promise<void> => {
    const fichiers = [...e.clipboardData.files]
    if (!fichiers.length) return
    e.preventDefault()
    const p = (await Promise.all(fichiers.map(versPiece))).filter((x): x is PieceJointe => !!x)
    setPieces((x) => [...x, ...p])
  }

  return (
    <div className="saisie-bloc">
      {menuOuvert && (
        <div className="menu-cmd" role="listbox">
          {commandes === null && <div className="cmd-vide">Je demande la liste à Claude Code…</div>}
          {commandes !== null && !filtre.length && <div className="cmd-vide">Aucune commande ne commence par « /{motif?.[1]} ».</div>}
          {filtre.map((c, i) => (
            <button
              key={c.nom}
              type="button"
              role="option"
              aria-selected={i === choix}
              className={i === choix ? 'on' : ''}
              onMouseEnter={() => setChoix(i)}
              onMouseDown={(e) => { e.preventDefault(); prendre(c) }}
            >
              <strong>/{c.nom}</strong>
              {c.argument && <em>{c.argument}</em>}
              <small>{c.description}</small>
            </button>
          ))}
        </div>
      )}
      {pieces.length > 0 && (
        <div className="pieces">
          {pieces.map((p, i) => (
            <span key={i} className="piece" title={p.chemin ?? p.nom}>
              {p.image ? <img src={`data:${p.image.media};base64,${p.image.donnees}`} alt="" /> : <b>{p.nom.split('.').pop()?.slice(0, 4)}</b>}
              <span>{p.nom}</span>
              <button type="button" title="Retirer" onClick={() => setPieces(pieces.filter((_, j) => j !== i))}>✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="saisie">
        <button type="button" className="joindre" title="Joindre un fichier" onClick={() => fichier.current?.click()}>
          <Trombone />
        </button>
        <input
          ref={fichier}
          type="file"
          multiple
          hidden
          onChange={async (e) => {
            const p = (await Promise.all([...(e.target.files ?? [])].map(versPiece))).filter((x): x is PieceJointe => !!x)
            setPieces((x) => [...x, ...p])
            e.target.value = ''
          }}
        />
        <textarea
          ref={zone}
          rows={1}
          value={texte}
          placeholder="Écris à Claude, / pour les commandes…"
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={touche}
          onPaste={(e) => void coller(e)}
        />
        {enCours
          ? <button type="button" className="envoi stop" title="Arrêter" onClick={arreter}>■</button>
          : texte.trim() || pieces.length
            ? <button type="button" className="envoi" title="Envoyer (Entrée)" onClick={partir}>↑</button>
            : <button type="button" className="envoi parler" title="Parler" data-action="parler" onClick={parler}><Micro /></button>}
      </div>
    </div>
  )
})
