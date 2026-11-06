import { useEffect, useRef, useState } from 'react'
import { appliquer, type Bloc, type Diff, type Etat, type Humeur, type Mode, type Outil, type PieceJointe, type Reponse } from '@shared/types'
import { Bulles, Micro, Prise, Roue } from './icones'
import type { Veille } from './lib/veille'
import { useParole } from './lib/parole'
import { Markdown } from './markdown'
import OutilsProjet from './OutilsProjet'
import Parler from './Parler'
import { COULEURS } from './poulpe'
import Reglages from './Reglages'
import { Saisie, versPiece, type SaisieRef } from './Saisie'

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

type Vue = 'chat' | 'hub' | 'parler' | 'reglages' | 'outils'

export default function Panneau(): JSX.Element {
  const [etat, setEtat] = useState<Etat | null>(null)
  const [humeur, setHumeur] = useState<Humeur>('repos')
  const [fil, setFil] = useState<Bloc[]>([])
  /** Le projet dont le fil est affiché : un événement d'un autre projet recharge le bon fil. */
  const filDe = useRef<string | null>(null)
  const [vue, setVue] = useState<Vue>('chat')
  const [glisse, setGlisse] = useState(false)
  const saisie = useRef<SaisieRef>(null)
  const bas = useRef<HTMLDivElement>(null)
  const parole = useParole(etat?.reglages.suite ?? true)
  // Les écouteurs posés au montage lisent la phase par ici : la leur serait figée.
  const phase = useRef(parole.phase)
  phase.current = parole.phase

  const montrerFil = async (id: string): Promise<void> => {
    filDe.current = id
    const f = await window.api.fil(id)
    if (filDe.current === id) setFil(f)
  }

  useEffect(() => {
    void window.api.etat().then((e) => {
      setEtat(e)
      if (e.actif) void montrerFil(e.actif)
    })
    void window.api.humeur().then(setHumeur)
    const offs = [
      window.api.surEtat(setEtat),
      window.api.surHumeur(setHumeur),
      window.api.surOuvert(() => setTimeout(() => saisie.current?.focus(), 30)),
      window.api.surParler(() => {
        setVue('parler')
        parole.lancer()
      }),
      window.api.surEvenement((projet, e) => {
        // Le fil enregistré par le main fait foi : on le recharge en entier
        // (le premier message dans un projet créé depuis le chat y bascule).
        if (projet !== filDe.current) void montrerFil(projet)
        else setFil((f) => appliquer(f, e))
      })
    ]
    const echap = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (phase.current === 'ecoute') parole.annuler()
      else window.api.fermer()
    }
    addEventListener('keydown', echap)
    return () => { offs.forEach((o) => o()); removeEventListener('keydown', echap) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // La veille : dire « Encre » ouvre le mode Parler. Elle se tait pendant
  // qu'on parle ou que le poulpe répond, sinon elle s'entendrait elle-même.
  const veilleActive = !!etat?.reglages.veille && !!etat?.reglages.cleGroq
  const veille = useRef<Veille | null>(null)
  useEffect(() => {
    if (!veilleActive) {
      veille.current?.arreter()
      veille.current = null
      return
    }
    let fini = false
    void (async () => {
      const octets = await window.api.modeleVeille()
      if (!octets || fini) return
      try {
        const { Veille } = await import('./lib/veille')
        const v = await Veille.partagee(octets, '', () => window.api.veilleMot())
        v.journal = (l) => window.api.noter(l)
        if (fini) v.arreter()
        else veille.current = v
      } catch (e) {
        window.api.noter(`veille : ${String(e)}`)
      }
    })()
    return () => { fini = true; veille.current?.arreter(); veille.current = null }
  }, [veilleActive])
  useEffect(() => {
    if (parole.phase === 'pret') veille.current?.reprendre()
    else veille.current?.suspendre()
  }, [parole.phase])

  useEffect(() => bas.current?.scrollIntoView({ block: 'end' }), [fil, vue])

  const projet = etat?.projets.find((p) => p.id === etat.actif) ?? null
  const enCours = !!etat?.enCours

  const envoyer = (texte: string, pieces: PieceJointe[]): void => {
    if (!projet || enCours) return
    window.api.envoyer(texte, pieces)
  }
  const repondre = (id: string, r: Reponse): void => window.api.repondre(id, r)
  const nouvelle = (): void => { if (!enCours) { setFil([]); window.api.nouvelle() } }
  const basculer = (v: Vue): void => setVue(vue === v ? 'chat' : v)

  // Glisser des fichiers n'importe où sur le panneau.
  const deposer = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    setGlisse(false)
    const p = (await Promise.all([...e.dataTransfer.files].map(versPiece))).filter((x): x is PieceJointe => !!x)
    if (p.length) {
      setVue('chat')
      saisie.current?.ajouter(p)
    }
  }

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
  } else if (vue === 'reglages') corps = <Reglages etat={etat} />
  else if (vue === 'hub') {
    corps = (
      <Hub
        etat={etat}
        ouvrir={(id) => {
          if (id !== filDe.current) void montrerFil(id)
          window.api.choisirProjet(id)
          setVue('chat')
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
  } else if (vue === 'outils') corps = <OutilsProjet projet={projet} />
  else if (vue === 'parler') corps = <Parler parole={parole} humeur={humeur} fil={fil} veille={veilleActive} />
  else {
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
          if (x.type === 'moi') {
            return (
              <div key={i} className={`moi ${x.voix ? 'voix' : ''}`}>
                {x.voix && <span className="dit-voix"><Micro /></span>}
                {x.texte}
                {x.pieces?.length ? <div className="jointes">{x.pieces.map((n, j) => <span key={j}>{n}</span>)}</div> : null}
              </div>
            )
          }
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

  const titres: Partial<Record<Vue, [string, string]>> = {
    hub: ['Projets', 'Choisis où travailler'],
    reglages: ['Réglages', 'Voix, démarrage, Claude Code'],
    outils: ['Outils', projet?.nom ?? '']
  }
  const titre = titres[vue]

  return (
    <div
      className="panneau"
      style={{ '--mood': COULEURS[parole.phase === 'ecoute' ? 'ecoute' : humeur] } as React.CSSProperties}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setGlisse(true) } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setGlisse(false) }}
      onDrop={(e) => void deposer(e)}
    >
      <header>
        <button type="button" className="projet" onClick={() => basculer('hub')} title="Tes projets">
          <span className={`tag ${projet?.libre ? 'libre' : ''}`} style={projet?.libre ? undefined : { background: projet?.couleur }}>
            {projet?.libre ? '✦' : projet ? initiales(projet.nom) : '+'}
          </span>
          <span className="noms">
            <strong>{titre?.[0] ?? projet?.nom ?? 'Aucun projet'}</strong>
            <small>{titre?.[1] ?? (projet?.libre ? 'Questions sans projet' : projet?.dossier)}</small>
          </span>
          <span className="chevron">{vue === 'hub' ? '▴' : '▾'}</span>
        </button>
        <div className="actions">
          <button type="button" data-vue="parler" className={`icone ${vue === 'parler' ? 'on' : ''}`} title={vue === 'parler' ? 'Revenir au chat' : 'Parler'} onClick={() => basculer('parler')} disabled={!projet}>
            {vue === 'parler' ? <Bulles /> : <Micro />}
          </button>
          <button type="button" data-vue="outils" className={`icone ${vue === 'outils' ? 'on' : ''}`} title="Outils du projet" onClick={() => basculer('outils')} disabled={!projet}><Prise /></button>
          <button type="button" data-vue="reglages" className={`icone ${vue === 'reglages' ? 'on' : ''}`} title="Réglages" onClick={() => basculer('reglages')}><Roue /></button>
          <button type="button" className="icone" title="Nouvelle conversation" onClick={nouvelle} disabled={enCours || !projet}>＋</button>
          <button type="button" className="icone" title="Fermer (Échap)" onClick={() => window.api.fermer()}>✕</button>
        </div>
      </header>

      {corps}

      {glisse && <div className="depot">Lâche pour joindre</div>}

      {projet && vue === 'chat' && etat?.claude.installe && (
        <footer>
          <Saisie ref={saisie} enCours={enCours} envoyer={envoyer} arreter={() => window.api.arreter()} projet={projet.id} />
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
