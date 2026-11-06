import { useEffect, useRef, useState } from 'react'
import type { Diff, Etat, Evenement, Humeur, Mode, Outil, Reponse } from '@shared/types'
import { Markdown } from './markdown'
import { COULEURS } from './poulpe'

type Element =
  | { type: 'moi'; texte: string }
  | { type: 'ia'; texte: string }
  | { type: 'outil'; outil: Outil }
  | { type: 'demande'; demande: Outil }
  | { type: 'fin'; erreur?: string; duree: number }
  | { type: 'info'; texte: string }

const MODES: { id: Mode; nom: string; aide: string }[] = [
  { id: 'demander', nom: 'Demander', aide: 'Chaque action te sera demandée.' },
  { id: 'modifs', nom: 'Modifs auto', aide: 'Les fichiers se modifient seuls, les commandes te sont demandées.' },
  { id: 'auto', nom: 'Auto', aide: 'Le mode auto de Claude Code : il ne demande que quand il hésite.' }
]

const duree = (ms: number): string => (ms < 60000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`)
const initiales = (nom: string): string => nom.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').map((m) => m[0]).join('').slice(0, 2).toUpperCase() || '·'

function VueDiff({ diff }: { diff: Diff }): JSX.Element {
  const avant = diff.avant ? diff.avant.split('\n') : []
  const apres = diff.apres.split('\n')
  const max = 14
  const lignes = [...avant.map((l) => ['d', l] as const), ...apres.map((l) => ['a', l] as const)]
  return (
    <div className="diff">
      {lignes.slice(0, max).map(([s, l], i) => (
        <div key={i} className={`l ${s}`}>{(s === 'd' ? '- ' : '+ ') + l}</div>
      ))}
      {lignes.length > max && <div className="l plus">… {lignes.length - max} lignes de plus</div>}
    </div>
  )
}

function LigneOutil({ outil }: { outil: Outil }): JSX.Element {
  const [ouvert, setOuvert] = useState(false)
  const depliable = !!(outil.diff || outil.detail)
  return (
    <div className="outil">
      <button type="button" className="tete" onClick={() => depliable && setOuvert(!ouvert)} disabled={!depliable}>
        <b />
        <span>{outil.libelle}</span>
      </button>
      {ouvert && outil.diff && <VueDiff diff={outil.diff} />}
      {ouvert && !outil.diff && outil.detail && <div className="detail">{outil.detail}</div>}
    </div>
  )
}

function Demande({ d, repondre }: { d: Outil; repondre: (r: Reponse) => void }): JSX.Element {
  return (
    <div className="demande">
      <div className="q">{d.libelle}</div>
      {d.diff ? <VueDiff diff={d.diff} /> : d.detail ? <div className="cmd">{d.detail}</div> : null}
      <div className="btns">
        <button type="button" className="btn pri" onClick={() => repondre('oui')}>Autoriser</button>
        <button type="button" className="btn" onClick={() => repondre('toujours')}>Toujours sur ce projet</button>
        <button type="button" className="btn" onClick={() => repondre('non')}>Refuser</button>
      </div>
    </div>
  )
}

function ilYa(ms: number): string {
  if (!ms) return 'Jamais ouvert'
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 1) return 'À l’instant'
  if (m < 60) return `Il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `Il y a ${h} h`
  const j = Math.round(h / 24)
  return j === 1 ? 'Hier' : `Il y a ${j} jours`
}

/** Le hub : tous les projets en cartes, Libre en premier, les plus récents ensuite. */
function Hub({ etat, ouvrir }: { etat: Etat; ouvrir: (id: string) => void }): JSX.Element {
  const libre = etat.projets.find((p) => p.libre)
  const autres = etat.projets.filter((p) => !p.libre).sort((a, b) => b.derniere - a.derniere)
  return (
    <div className="hub">
      <div className="hub-tete">
        <h3>Tes projets</h3>
        <p>Pour en créer un, dis-le dans le chat : « je bosse sur L’Oréal, projet BIM ».</p>
      </div>
      <div className="cartes">
        {libre && (
          <button type="button" className={`carte libre ${libre.id === etat.actif ? 'on' : ''}`} onClick={() => ouvrir(libre.id)} disabled={etat.enCours}>
            <span className="tag">✦</span>
            <strong>Libre</strong>
            <small>Questions sans projet</small>
          </button>
        )}
        {autres.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={`carte ${p.id === etat.actif ? 'on' : ''}`}
            style={{ '--penche': `${[-6, 5, -3, 4][i % 4]}deg` } as React.CSSProperties}
            onClick={() => ouvrir(p.id)}
            onContextMenu={(e) => { e.preventDefault(); window.api.menuCarte(p.id) }}
            disabled={etat.enCours}
            title={p.dossier}
          >
            <span className="tag" style={{ background: p.couleur }}>{initiales(p.nom)}</span>
            <strong>{p.nom}</strong>
            <small>{ilYa(p.derniere)}</small>
          </button>
        ))}
        <button type="button" className="carte lier" onClick={() => window.api.ajouterProjet()} disabled={etat.enCours}>
          <span className="tag">＋</span>
          <strong>Lier un dossier</strong>
          <small>Un projet qui existe déjà</small>
        </button>
      </div>
    </div>
  )
}

export default function Panneau(): JSX.Element {
  const [etat, setEtat] = useState<Etat | null>(null)
  const [humeur, setHumeur] = useState<Humeur>('repos')
  const [fil, setFil] = useState<Element[]>([])
  const [saisie, setSaisie] = useState('')
  const [hub, setHub] = useState(false)
  const zone = useRef<HTMLTextAreaElement>(null)
  const bas = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.api.etat().then(setEtat)
    void window.api.humeur().then(setHumeur)
    const offs = [
      window.api.surEtat(setEtat),
      window.api.surHumeur(setHumeur),
      window.api.surOuvert(() => setTimeout(() => zone.current?.focus(), 30)),
      window.api.surEvenement((e: Evenement) =>
        setFil((f) => {
          if (e.type === 'texte') {
            const dernier = f[f.length - 1]
            if (dernier?.type === 'ia') return [...f.slice(0, -1), { type: 'ia', texte: dernier.texte + e.texte }]
            return [...f, { type: 'ia', texte: e.texte }]
          }
          if (e.type === 'outil') return [...f, { type: 'outil', outil: e.outil }]
          if (e.type === 'demande') return [...f, { type: 'demande', demande: e.demande }]
          if (e.type === 'demande-close') return f.filter((x) => !(x.type === 'demande' && x.demande.id === e.id))
          if (e.type === 'info') return [...f, { type: 'info', texte: e.texte }]
          return [...f, { type: 'fin', erreur: e.erreur, duree: e.duree }]
        })
      )
    ]
    const echap = (e: KeyboardEvent): void => { if (e.key === 'Escape') window.api.fermer() }
    addEventListener('keydown', echap)
    return () => { offs.forEach((o) => o()); removeEventListener('keydown', echap) }
  }, [])

  useEffect(() => bas.current?.scrollIntoView({ block: 'end' }), [fil])

  const projet = etat?.projets.find((p) => p.id === etat.actif) ?? null
  const enCours = !!etat?.enCours

  const envoyer = (): void => {
    const t = saisie.trim()
    if (!t || !projet || enCours) return
    setFil((f) => [...f, { type: 'moi', texte: t }])
    setSaisie('')
    window.api.envoyer(t)
  }
  const repondre = (id: string, r: Reponse): void => window.api.repondre(id, r)
  const nouvelle = (): void => { if (!enCours) { setFil([]); window.api.nouvelle() } }

  let corps: JSX.Element
  if (!etat) corps = <div className="vide" />
  else if (!etat.claude.installe) {
    corps = (
      <div className="vide">
        <h3>Claude Code n'est pas installé</h3>
        <p>Encre passe par le Claude Code de ta machine. Installe-le, connecte-toi, puis rouvre Encre.</p>
        <code>npm install -g @anthropic-ai/claude-code</code>
      </div>
    )
  } else if (hub) {
    corps = (
      <Hub
        etat={etat}
        ouvrir={(id) => {
          // Un autre projet, une autre conversation : le fil repart vide.
          if (id !== etat.actif) setFil([])
          window.api.choisirProjet(id)
          setHub(false)
        }}
      />
    )
  } else if (!projet) {
    corps = (
      <div className="vide">
        <h3>Choisis un projet</h3>
        <p>Un projet, c'est un dossier. Encre y lit le CLAUDE.md et les outils branchés (Figma, Notion…).</p>
        <button type="button" className="btn pri" onClick={() => window.api.ajouterProjet()}>Ajouter un projet</button>
      </div>
    )
  } else {
    corps = (
      <div className="fil">
        {fil.length === 0 && (
          <div className="accueil">
            <h3>{projet.libre ? 'Pose ta question.' : 'On bosse sur quoi ?'}</h3>
            <p>
              {projet.libre
                ? 'Pas de projet ici. Pour en lancer un, dis-le : « je bosse sur L’Oréal, projet BIM ». Encre le crée et le range dans tes projets.'
                : projet.session
                  ? 'La dernière conversation de ce projet reprend au prochain message.'
                  : `Claude travaille dans ${projet.dossier}.`}
            </p>
          </div>
        )}
        {fil.map((x, i) => {
          if (x.type === 'moi') return <div key={i} className="moi">{x.texte}</div>
          if (x.type === 'ia') return <div key={i} className="ia"><Markdown texte={x.texte} /></div>
          if (x.type === 'outil') return <LigneOutil key={i} outil={x.outil} />
          if (x.type === 'demande') return <Demande key={i} d={x.demande} repondre={(r) => repondre(x.demande.id, r)} />
          if (x.type === 'info') return <div key={i} className="info">{x.texte}</div>
          return x.erreur
            ? <div key={i} className="erreur">{x.erreur}</div>
            : <div key={i} className="fait">Fait en {duree(x.duree)}</div>
        })}
        {enCours && humeur !== 'accord' && <div className="attente"><i /><i /><i /></div>}
        <div ref={bas} />
      </div>
    )
  }

  return (
    <div className="panneau" style={{ '--mood': COULEURS[humeur] } as React.CSSProperties}>
      <header>
        <button
          type="button"
          className="projet"
          onClick={() => setHub(!hub)}
          title="Tes projets"
        >
          <span className={`tag ${projet?.libre ? 'libre' : ''}`} style={projet?.libre ? undefined : { background: projet?.couleur }}>
            {projet?.libre ? '✦' : projet ? initiales(projet.nom) : '+'}
          </span>
          <span className="noms">
            <strong>{hub ? 'Projets' : projet?.nom ?? 'Aucun projet'}</strong>
            <small>{hub ? 'Choisis où travailler' : projet?.libre ? 'Questions sans projet' : projet?.dossier}</small>
          </span>
          <span className="chevron">{hub ? '▴' : '▾'}</span>
        </button>
        <div className="actions">
          <button type="button" className="icone" title="Nouvelle conversation" onClick={nouvelle} disabled={enCours || !projet}>＋</button>
          <button type="button" className="icone" title="Fermer (Échap)" onClick={() => window.api.fermer()}>✕</button>
        </div>
      </header>

      {corps}

      {projet && !hub && etat?.claude.installe && (
        <footer>
          <div className="saisie">
            <textarea
              ref={zone}
              rows={1}
              value={saisie}
              placeholder="Écris à Claude…"
              onChange={(e) => setSaisie(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer() } }}
            />
            {enCours
              ? <button type="button" className="envoi stop" title="Arrêter" onClick={() => window.api.arreter()}>■</button>
              : <button type="button" className="envoi" title="Envoyer (Entrée)" onClick={envoyer} disabled={!saisie.trim()}>↑</button>}
          </div>
          <div className="modes" role="radiogroup" aria-label="Autorisations">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={projet.mode === m.id}
                title={m.aide}
                className={projet.mode === m.id ? 'on' : ''}
                onClick={() => window.api.mode(m.id)}
              >
                {m.nom}
              </button>
            ))}
          </div>
        </footer>
      )}
    </div>
  )
}
