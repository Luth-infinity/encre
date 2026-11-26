import { useEffect, useRef, useState, Fragment } from 'react'
import { appliquer, avatarDe, type Bloc, type Cite, type Diff, type Etat, type Fenetre, type Humeur, type Limites, type Mode, type Outil, type PieceJointe, type Projet, type Reponse } from '@shared/types'
import Accueil, { Creature, EnAttente } from './Accueil'
import Appel from './Appel'
import { Agrandir, Chevron, Micro, Prise, Reduire, Roue } from './icones'
import type { Veille } from './lib/veille'
import { useParole } from './lib/parole'
import { Markdown } from './markdown'
import OutilsProjet from './OutilsProjet'
import { COULEURS } from './poulpe'
import { portrait } from './poulpe2d'
import Reglages from './Reglages'
import { Saisie, versPiece, type SaisieRef } from './Saisie'

const MODES: { id: Mode; nom: string; aide: string }[] = [
  { id: 'demander', nom: 'Demander', aide: 'Chaque action te sera demandée.' },
  { id: 'modifs', nom: 'Modifs auto', aide: 'Les fichiers se modifient seuls, les commandes te sont demandées.' },
  { id: 'auto', nom: 'Tout auto', aide: 'Le mode auto de Claude Code : il ne demande que quand il hésite.' }
]

/** 48 200 → « 48 k », 1 250 000 → « 1,3 M ». */
const k = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} M` : `${Math.max(1, Math.round(n / 1000))} k`)
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

/**
 * Plusieurs actions d'affilée (lire, chercher, écrire…) tiennent en une
 * carte : la dernière se voit, les autres se déplient.
 */
function Etapes({ outils, enCours }: { outils: Outil[]; enCours: boolean }): JSX.Element {
  const [ouvert, setOuvert] = useState(false)
  if (outils.length === 1) return <LigneOutil outil={outils[0]} />
  const visibles = ouvert ? outils : outils.slice(-1)
  return (
    <div className={`etapes ${enCours ? 'vivantes' : ''}`}>
      <button type="button" className="compte" onClick={() => setOuvert(!ouvert)}>
        {outils.length} étapes <span>{ouvert ? 'Replier' : 'Tout voir'}</span>
      </button>
      {visibles.map((o, i) => <LigneOutil key={i} outil={o} />)}
    </div>
  )
}

/** Le fil découpé pour l'affichage : les actions consécutives regroupées, et « Tako » en tête de chaque réponse. */
type Morceau = { type: 'bloc'; bloc: Bloc; i: number } | { type: 'etapes'; outils: Outil[]; i: number } | { type: 'qui'; i: number }
function morceaux(fil: Bloc[]): Morceau[] {
  const out: Morceau[] = []
  let avant: Bloc['type'] | null = null
  fil.forEach((b, i) => {
    const repond = b.type === 'ia' || b.type === 'outil' || b.type === 'demande'
    if (repond && (avant === null || avant === 'moi' || avant === 'fin')) out.push({ type: 'qui', i: -i - 1 })
    const dernier = out[out.length - 1]
    if (b.type === 'outil' && dernier?.type === 'etapes') dernier.outils.push(b.outil)
    else if (b.type === 'outil') out.push({ type: 'etapes', outils: [b.outil], i })
    else out.push({ type: 'bloc', bloc: b, i })
    if (b.type !== 'info') avant = b.type
  })
  return out
}

/** Ce que fait Tako dans un projet : rien, il travaille, ou il attend ton accord. */
function activite(etat: Etat, id: string, seul = false): 'attend' | 'travaille' | null {
  // Un projet compte aussi ce qui se passe dans ses sujets (sauf « Général », qui n'est que lui).
  const ids = [id, ...(seul ? [] : etat.projets.filter((p) => p.parent === id).map((p) => p.id))]
  if (ids.some((x) => etat.attend.includes(x))) return 'attend'
  return ids.some((x) => etat.enCours.includes(x)) ? 'travaille' : null
}

/** Le compte Claude qui travaille sur ce projet, et le moyen d'en changer : un clic sur la pastille, un clic sur le compte. */
function SelecteurCompte({ etat, projet }: { etat: Etat; projet: Projet | null }): JSX.Element | null {
  const [ouvert, setOuvert] = useState(false)
  useEffect(() => {
    if (!ouvert) return
    const fermer = (e: PointerEvent): void => { if (!(e.target as Element).closest('.compte-choix')) setOuvert(false) }
    const echap = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOuvert(false) }
    addEventListener('pointerdown', fermer)
    addEventListener('keydown', echap, true)
    return () => { removeEventListener('pointerdown', fermer); removeEventListener('keydown', echap, true) }
  }, [ouvert])
  const actuel = etat.comptes.find((c) => c.actif)
  // Un seul compte : rien à choisir, pas de pastille de plus dans l'en-tête.
  if (!actuel || etat.comptes.length < 2) return null
  return (
    <div className="compte-choix">
      <button type="button" className={`compte-puce ${ouvert ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}
        title={`Compte Claude de ce projet : ${actuel.nom}. Cliquer pour changer.`}>
        <img className="pastille" src={portrait(avatarDe(actuel.avatar).espece)} alt="" />
        <span>{actuel.nom}</span><Chevron haut={ouvert} />
      </button>
      <div className={`menu-compte ${ouvert ? 'ouvert' : ''}`} role="menu">
        <small className="section">{projet && !projet.libre ? 'Compte de ce projet' : 'Compte en cours'}</small>
        {etat.comptes.map((c) => (
          <button key={c.id} type="button" role="menuitemradio" aria-checked={c.actif} disabled={!c.connecte}
            className={c.actif ? 'on' : ''} onClick={() => { setOuvert(false); if (!c.actif) window.api.choisirCompte(c.id) }}>
            <img className="pastille" src={portrait(avatarDe(c.avatar).espece)} alt="" />
            <span className="qui-compte"><strong>{c.nom}</strong><small>{c.connecte ? c.offre ?? c.email ?? '' : 'À connecter dans Réglages'}</small></span>
            {c.actif && <span className="coche" aria-hidden>✓</span>}
          </button>
        ))}
        {/* Un fil déjà long : l'autre compte ne l'a pas en cache, il sera relu en entier au prochain message. */}
        {!!projet?.contexte && projet.contexte > 20000 && <small className="note">Changer de compte : ce fil ({k(projet.contexte)}) sera relu en entier au prochain message.</small>}
      </div>
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

/** Créer un projet sans passer par le chat : un nom, et ce que Claude doit savoir. */
function NouveauProjet({ fini }: { fini: (id: string | null) => void }): JSX.Element {
  const [nom, setNom] = useState('')
  const [contexte, setContexte] = useState('')
  return (
    <form className="nouveau" onSubmit={(e) => { e.preventDefault(); void window.api.creerProjet(nom, contexte).then(fini) }}>
      <strong>Nouveau projet</strong>
      <input autoFocus placeholder="Nom (ex. Client · Refonte du site)" value={nom} onChange={(e) => setNom(e.target.value)} />
      <textarea rows={3} placeholder="De quoi il s’agit, le client, les outils… (facultatif, ça part dans le CLAUDE.md)" value={contexte} onChange={(e) => setContexte(e.target.value)} />
      <small>Rangé dans Documents/Encre/Projets.</small>
      <div className="btns">
        <button type="button" className="btn" onClick={() => fini(null)}>Annuler</button>
        <button type="submit" className="btn pri" disabled={!nom.trim()}>Créer</button>
      </div>
    </form>
  )
}

/** Pour chercher sans se soucier des accents ni des majuscules. */
const plat = (t: string): string => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
/** ⌘K sur Mac, Ctrl+K ailleurs. */
const RACCOURCI = navigator.platform.startsWith('Mac') ? '⌘K' : 'Ctrl+K'

/** Une ligne de la palette ou de la bascule : la pastille du projet, le nom, ce que Tako y fait. */
function LigneFil({ etat, p, sel, sous, survol, ouvrir }: { etat: Etat; p: Projet; sel: boolean; sous?: boolean; survol: () => void; ouvrir: (id: string) => void }): JSX.Element {
  const r = (p.parent && etat.projets.find((x) => x.id === p.parent)) || p
  const a = activite(etat, p.id, true)
  return (
    <button type="button" role="option" aria-selected={sel} className={`${sel ? 'sel' : ''} ${p.id === etat.actif ? 'ici' : ''} ${sous ? 'sous' : ''}`}
      onMouseMove={survol} onClick={() => ouvrir(p.id)} title={r.dossier}
      onContextMenu={(e) => { e.preventDefault(); if (!p.libre) window.api.menuCarte(p.id) }}>
      {sous ? <span className="tag trait" /> : <span className={`tag ${p.libre ? 'libre' : ''}`} style={p.libre ? undefined : { background: r.couleur }}>{p.libre ? '✦' : initiales(r.nom)}</span>}
      <span className="nom">{p.libre ? 'Libre' : p.nom}<small>{p.libre ? ' · une question, sans projet' : p.parent && !sous ? ` · ${r.nom}` : ''}</small></span>
      {a && <i className={`activite ${a}`} />}
      <small className="quand">{a === 'attend' ? 'attend ton accord' : a ? 'travaille' : p.id === etat.actif ? 'ici' : p.libre ? '' : ilYa(p.derniere)}</small>
    </button>
  )
}

/**
 * La palette (⌘K ou clic sur le titre) : le seul endroit où l'on voit les projets
 * (piste D, validée le 24/11 : pas de barre ni de hub, l'écran reste calme).
 * Sans rien taper : ce qui tourne, puis TOUS les projets, chacun suivi de ses sujets
 * (26/11 : avec seulement 7 récents, Lucas ne retrouvait plus ses sujets).
 * On tape pour chercher parmi tous, projets et sujets mélangés.
 */
function Palette({ etat, ouvrir, fermer }: { etat: Etat; ouvrir: (id: string) => void; fermer: () => void }): JSX.Element {
  const [q, setQ] = useState('')
  const [n, setN] = useState(0)
  const [cree, setCree] = useState(false)
  const actif = etat.projets.find((p) => p.id === etat.actif)
  const racineDe = (p: Projet): Projet => (p.parent && etat.projets.find((x) => x.id === p.parent)) || p
  const racines = etat.projets.filter((p) => !p.parent && !p.libre)
  const sujetsDe = (id: string): Projet[] => etat.projets.filter((p) => p.parent === id).sort((a, b) => b.derniere - a.derniere)
  // Un projet remonte quand l'un de ses sujets a servi.
  const recence = (p: Projet): number => Math.max(p.derniere, ...sujetsDe(p.id).map((x) => x.derniere))
  racines.sort((a, b) => recence(b) - recence(a))
  /** Le sujet neuf : dans quel projet il part, dit et modifiable (Lucas l'a créé dans le mauvais, 26/11). */
  const [sujet, setSujet] = useState<{ nom: string; dans: string } | null>(null)
  const libre = etat.projets.find((p) => p.libre)
  const vivants = [...etat.projets].sort((a, b) => b.derniere - a.derniere).filter((p) => activite(etat, p.id, true))
  type Rang = { p: Projet; sous?: boolean }
  const groupes: [string, Rang[]][] = q.trim()
    ? [['', [...etat.projets].sort((a, b) => b.derniere - a.derniere).filter((p) => plat(`${p.libre ? 'Libre' : p.nom} ${racineDe(p).nom}`).includes(plat(q.trim()))).map((p) => ({ p }))]]
    : [
        ['En cours', vivants.map((p) => ({ p }))],
        ['Projets', [...(libre ? [{ p: libre }] : []), ...racines.flatMap((r) => [{ p: r }, ...sujetsDe(r.id).map((x) => ({ p: x, sous: true }))])]]
      ]
  const liste = groupes.flatMap(([, l]) => l)
  useEffect(() => setN(0), [q])
  const creer = (): void => {
    const x = sujet?.nom.trim()
    const dans = sujet?.dans
    setSujet(null)
    if (x && dans) void window.api.creerSujet(dans, x).then((id) => id && ouvrir(id))
  }
  let rang = -1
  return (
    <>
      <div className="voile-palette" onMouseDown={fermer} />
      <div className="palette" role="dialog" aria-label="Aller à un projet ou un sujet">
        {cree
          ? <NouveauProjet fini={(id) => { setCree(false); if (id) ouvrir(id) }} />
          : (
            <>
              <input
                autoFocus
                value={q}
                placeholder="Aller à un projet ou un sujet…"
                aria-label="Chercher un projet ou un sujet"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setN((x) => Math.min(x + 1, liste.length - 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setN((x) => Math.max(x - 1, 0)) }
                  if (e.key === 'Enter' && liste[n]) ouvrir(liste[n].p.id)
                  if (e.key === 'Escape') { e.stopPropagation(); fermer() }
                }}
              />
              <div className="liste-palette" role="listbox">
                {groupes.map(([titre, l]) => l.length > 0 && (
                  <Fragment key={titre || 'trouves'}>
                    {titre && <small className="section">{titre}</small>}
                    {l.map(({ p, sous }) => {
                      const ici = ++rang
                      return <LigneFil key={`${titre}${p.id}`} etat={etat} p={p} sous={sous} sel={ici === n} survol={() => setN(ici)} ouvrir={ouvrir} />
                    })}
                  </Fragment>
                ))}
                {!liste.length && <p className="rien">Aucun projet ne s’appelle comme ça. Dis-le dans le chat, Tako le crée.</p>}
              </div>
              {sujet
                ? (
                  <form className="pied-palette sujet-neuf" onSubmit={(e) => { e.preventDefault(); creer() }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setSujet(null) } }}>
                    <span>Nouveau sujet dans</span>
                    {/* Chevron maison : celui du système collait au nom (26/11). */}
                    <span className="choix-projet">
                      <select value={sujet.dans} onChange={(e) => setSujet({ ...sujet, dans: e.target.value })} aria-label="Projet du sujet">
                        {racines.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                      </select>
                      <Chevron />
                    </span>
                    <input className="sujet-nom" autoFocus placeholder="Ticket 142, page tarifs…" value={sujet.nom} onChange={(e) => setSujet({ ...sujet, nom: e.target.value })} />
                    <button type="submit" className="fort" disabled={!sujet.nom.trim()}>Créer</button>
                  </form>
                )
                : (
                  <div className="pied-palette">
                    {racines.length > 0 && (
                      <button type="button" onClick={() => setSujet({ nom: '', dans: (actif && !actif.libre ? racineDe(actif) : racines[0]).id })}
                        title="Une conversation à part dans un projet : Tako relit moins, tu dépenses moins">＋ Nouveau sujet</button>
                    )}
                    <span className="espace" />
                    <button type="button" onClick={() => { fermer(); window.api.ajouterProjet() }}>Lier un dossier</button>
                    <button type="button" className="fort" data-action="nouveau" onClick={() => setCree(true)}>＋ Nouveau projet</button>
                  </div>
                )}
            </>
          )}
      </div>
    </>
  )
}

/**
 * Ctrl+Tab, comme Cmd+Tab entre les apps : les derniers fils, du plus récent au plus ancien.
 * Ctrl tenu, Tab avance (Maj+Tab recule), Ctrl relâché ouvre. Rien à l'écran le reste du temps
 * (option C du 26/11 : revenir vite sur un sujet sans rouvrir de barre).
 */
function Bascule({ etat, vus, ouvrir, fermer }: { etat: Etat; vus: string[]; ouvrir: (id: string) => void; fermer: () => void }): JSX.Element {
  const parId = new Map(etat.projets.map((p) => [p.id, p]))
  const autres = [...etat.projets].sort((a, b) => b.derniere - a.derniere).filter((p) => !vus.includes(p.id))
  const liste = [...vus.map((id) => parId.get(id)).filter((p): p is Projet => !!p), ...autres].slice(0, 7)
  const [n, setN] = useState(Math.min(1, liste.length - 1))
  const choix = useRef(n)
  choix.current = n
  useEffect(() => {
    const bas = (e: KeyboardEvent): void => {
      if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); setN((x) => (x + (e.shiftKey ? -1 : 1) + liste.length) % liste.length) }
      if (e.key === 'Escape') { e.stopPropagation(); fermer() }
    }
    const haut = (e: KeyboardEvent): void => { if (e.key === 'Control' && liste[choix.current]) ouvrir(liste[choix.current].id) }
    addEventListener('keydown', bas, true)
    addEventListener('keyup', haut, true)
    return () => { removeEventListener('keydown', bas, true); removeEventListener('keyup', haut, true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <>
      <div className="voile-palette" onMouseDown={fermer} />
      <div className="palette derniers" role="dialog" aria-label="Derniers fils">
        <div className="liste-palette" role="listbox">
          {liste.map((p, i) => <LigneFil key={p.id} etat={etat} p={p} sel={i === n} survol={() => setN(i)} ouvrir={ouvrir} />)}
        </div>
      </div>
    </>
  )
}

/** Le rayon qui couvre tout le panneau depuis la bulle : au-delà, l'encre finirait de s'étaler hors champ et l'effet passerait inaperçu. */
function rayonEncre(x: number, y: number): number {
  const w = innerWidth - 20, h = innerHeight - 20
  return Math.ceil(Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y)))
}

/** « à 5:30 » le jour même, « jeudi à 14:00 » ensuite. */
function quand(ms: number): string {
  const d = new Date(ms)
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return `à ${heure}`
  if (d.toDateString() === new Date(Date.now() + 86400000).toDateString()) return `demain à ${heure}`
  return `${d.toLocaleDateString('fr-FR', { weekday: 'long' })} à ${heure}`
}

/** « dans 2 h 14 », « dans 3 j 5 h » : le temps avant que la fenêtre reparte à zéro. */
function dans(ms: number): string {
  const min = Math.max(0, Math.round((ms - Date.now()) / 60000))
  if (min < 60) return `dans ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `dans ${h} h ${String(min % 60).padStart(2, '0')}`
  return `dans ${Math.floor(h / 24)} j ${h % 24} h`
}

/**
 * Le rythme : la part de la fenêtre déjà écoulée, comparée à la part utilisée.
 * À 40 % utilisés au quart de la semaine, la limite tombera avant la fin.
 */
function rythme(f: Fenetre, duree: number): { ecoule: number; projection: number } | null {
  if (!f.reprise) return null
  const ecoule = 1 - (f.reprise - Date.now()) / duree
  if (ecoule <= 0.05 || ecoule > 1) return null
  return { ecoule: Math.round(ecoule * 100), projection: Math.round(f.pourcent / ecoule) }
}

const H = 3600000
const FENETRES = [
  { cle: 'cinqHeures', court: 'Limite 5 h', long: '5 heures glissantes', duree: 5 * H },
  { cle: 'semaine', court: 'Semaine', long: 'Semaine', duree: 7 * 24 * H }
] as const

/**
 * Les limites du compte Claude, comme /usage dans le terminal : les 5 heures
 * glissantes et la semaine, en pourcentage. Au survol, une fiche donne le
 * détail : ce qui reste, quand ça repart, et si le rythme tiendra.
 * Orange à 80 %, rouge une fois pleine.
 */
function Jauges({ limites, compte }: { limites: Limites | null; compte?: string | null }): JSX.Element | null {
  if (!limites) return null
  const niveau = (p: number): string => (p >= 100 ? 'pleine' : p >= 80 ? 'haute' : '')
  const presentes = FENETRES.filter((x) => limites[x.cle])
  if (!presentes.length) return null
  const lu = Math.round((Date.now() - limites.lu) / 60000)
  return (
    <div className="jauges" tabIndex={0} aria-label="Limites du compte Claude">
      {presentes.map((x) => {
        const f = limites[x.cle]!
        return (
          <span key={x.cle} className={`jauge ${niveau(f.pourcent)}`}>
            <small>{x.court}</small>
            <i><b style={{ width: `${Math.min(100, f.pourcent)}%` }} /></i>
            <em>{f.pourcent} %</em>
          </span>
        )
      })}
      <div className="fiche-limites" role="tooltip">
        <strong>Limites de ton compte Claude</strong>
        {compte && <small className="lu">{compte}</small>}
        {presentes.map((x) => {
          const f = limites[x.cle]!
          const r = rythme(f, x.duree)
          return (
            <div key={x.cle} className={`ligne-limite ${niveau(f.pourcent)}`}>
              <div className="haut"><span>{x.long}</span><b>{f.pourcent} %</b></div>
              <i><b style={{ width: `${Math.min(100, f.pourcent)}%` }} />{r && <u style={{ left: `${r.ecoule}%` }} />}</i>
              <small>{f.pourcent >= 100 ? 'Pleine' : `Reste ${100 - f.pourcent} %`}{f.reprise ? ` · repart à zéro ${quand(f.reprise)} (${dans(f.reprise)})` : ''}</small>
              {r && f.pourcent < 100 && (
                <small>
                  {r.ecoule} % du temps écoulé ·{' '}
                  {r.projection >= 100 ? <em className="alerte">au rythme actuel, pleine avant la fin</em> : `au rythme actuel, ~${r.projection} % à la fin`}
                </small>
              )}
            </div>
          )
        })}
        <small className="lu">{lu < 1 ? 'Lu à l’instant' : `Lu il y a ${lu} min`} · le trait marque le temps écoulé</small>
      </div>
    </div>
  )
}

/** Une limite à 80 % ou plus : de quoi la montrer sous le champ. */
function limiteHaute(l: Limites | null): boolean {
  return !!l && FENETRES.some((x) => (l[x.cle]?.pourcent ?? 0) >= 80)
}

/** La limite pleine qui bloque, et quand elle se libère. */
function limitePleine(l: Limites | null): string | null {
  if (!l) return null
  const pleine = [l.cinqHeures, l.semaine].find((f) => f && f.pourcent >= 100)
  if (!pleine) return null
  return `Limite de Claude atteinte${pleine.reprise ? `, elle repart ${quand(pleine.reprise)}` : ''}.`
}

type Vue = 'chat' | 'reglages' | 'outils'

export default function Panneau(): JSX.Element {
  const [etat, setEtat] = useState<Etat | null>(null)
  const [humeur, setHumeur] = useState<Humeur>('repos')
  const [fil, setFil] = useState<Bloc[]>([])
  /** Le projet dont le fil est affiché : un événement d'un autre projet recharge le bon fil. */
  const filDe = useRef<string | null>(null)
  /** Le projet actif côté main, lu par les écouteurs posés au montage. */
  const actif = useRef<string | null>(null)
  const [vue, setVue] = useState<Vue>('chat')
  const [palette, setPalette] = useState(false)
  const [bascule, setBascule] = useState(false)
  const basculeOuverte = useRef(false)
  basculeOuverte.current = bascule
  /** Les fils ouverts pendant la session, le plus récent d'abord (Ctrl+Tab et ←). */
  const vus = useRef<string[]>([])
  const [precedent, setPrecedent] = useState<string | null>(null)
  const [glisse, setGlisse] = useState(false)
  const saisie = useRef<SaisieRef>(null)
  const bas = useRef<HTMLDivElement>(null)
  const [plein, setPlein] = useState(false)
  /** Gemini n'a pas pu parler (quota gratuit) : jusqu'à quand le dire. */
  const [muet, setMuet] = useState<{ jusqua: number; secondes: number } | null>(null)
  /** L'entrée en tache d'encre depuis la bulle, et la sortie inverse. */
  const [anim, setAnim] = useState<{ etat: 'entre' | 'sort' | ''; x: number; y: number; n: number }>({ etat: '', x: 0, y: 0, n: 0 })
  /** Le bouton « Répondre » posé sur un passage sélectionné d'une réponse. */
  const [selection, setSelection] = useState<{ texte: string; x: number; y: number; bas: number } | null>(null)
  /**
   * La bulle où l'on écrit sa réponse à un passage. « Ajouter » la pose au-dessus
   * du champ : le champ reste au message neutre. `n` : la réponse qu'on corrige.
   */
  const [brouillon, setBrouillon] = useState<{ passage: string; reponse: string; x: number; y: number; bas: number; n?: number } | null>(null)
  /** Le projet ou le sujet qu'on renomme (« Renommer… » du clic droit), et le nom tapé. */
  const [renomme, setRenomme] = useState<{ id: string; nom: string } | null>(null)
  const parole = useParole()
  // Les écouteurs posés au montage lisent l'appel par ici : le leur serait figé.
  const appel = useRef(parole)
  appel.current = parole

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
    window.api.limites()
    const offs = [
      window.api.surEtat(setEtat),
      window.api.surHumeur(setHumeur),
      window.api.surOuvert((o) => {
        // Retirer puis remettre la classe relance l'animation sans remonter le panneau (le brouillon reste).
        setAnim((a) => ({ etat: '', x: o.x, y: o.y, n: a.n + 1 }))
        requestAnimationFrame(() => requestAnimationFrame(() => setAnim((a) => ({ ...a, etat: 'entre' }))))
        setTimeout(() => saisie.current?.focus(), 60)
        window.api.limites()
      }),
      window.api.surAFermer((o) => {
        setAnim((a) => ({ etat: 'sort', x: o.x, y: o.y, n: a.n }))
        setTimeout(() => window.api.fermerFini(), 260)
      }),
      window.api.surPlein(setPlein),
      window.api.surVoixMuette((s) => {
        setMuet({ jusqua: Date.now() + 8000, secondes: s })
        setTimeout(() => setMuet((m) => (m && Date.now() >= m.jusqua ? null : m)), 8200)
      }),
      window.api.surFilChange((id) => void montrerFil(id)),
      window.api.surRenommer((id) => setEtat((e) => {
        const p = e?.projets.find((x) => x.id === id)
        if (p) setRenomme({ id, nom: p.nom })
        return e
      })),
      // Alt+Maj+E (même panneau fermé) : ouvrir l'écoute, ou envoyer. Le mot « Encre » : pareil, mains libres.
      window.api.surDicter((mainsLibres) => appel.current.basculer(mainsLibres)),
      window.api.surAnnulerDictee(() => appel.current.annuler()),
      window.api.surEvenement((projet, e) => {
        // Plusieurs projets travaillent à la fois : un événement d'un projet
        // qu'on ne regarde pas est déjà noté par le main, on n'y touche pas.
        // Celui du projet actif mais pas affiché (créé depuis le chat) fait
        // recharger son fil entier, qui fait foi.
        if (projet === filDe.current) setFil((f) => appliquer(f, e))
        else if (projet === actif.current) void montrerFil(projet)
      })
    ]
    const echap = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (appel.current.actif) appel.current.annuler()
      else window.api.fermer()
    }
    const allerA = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((x) => !x) }
      if (e.ctrlKey && e.key === 'Tab' && !basculeOuverte.current) { e.preventDefault(); setPalette(false); setBascule(true) }
    }
    addEventListener('keydown', echap)
    addEventListener('keydown', allerA)
    return () => { offs.forEach((o) => o()); removeEventListener('keydown', echap); removeEventListener('keydown', allerA) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // La veille : dire « Encre » ouvre le mode Parler. Elle se tait pendant
  // qu'on parle ou que le poulpe répond, sinon elle s'entendrait elle-même.
  // La police choisie dans les réglages : posée sur la racine, les styles suivent.
  const police = etat?.reglages.police
  useEffect(() => { if (police) document.documentElement.dataset.police = police }, [police])

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
    if (parole.actif) veille.current?.suspendre()
    else veille.current?.reprendre()
    window.api.echange(parole.actif)
  }, [parole.actif])

  useEffect(() => bas.current?.scrollIntoView({ block: 'end' }), [fil, vue])

  // Quel que soit le chemin (palette, Ctrl+Tab, Tako qui ouvre un sujet), le fil quitté devient « ← ».
  const actifId = etat?.actif
  useEffect(() => {
    if (!actifId || vus.current[0] === actifId) return
    if (vus.current[0]) setPrecedent(vus.current[0])
    vus.current = [actifId, ...vus.current.filter((x) => x !== actifId)]
  }, [actifId])

  const projet = etat?.projets.find((p) => p.id === etat.actif) ?? null
  const avant = (precedent && precedent !== projet?.id && etat?.projets.find((p) => p.id === precedent)) || null
  const racine = (projet?.parent && etat?.projets.find((p) => p.id === projet.parent)) || projet
  const avatar = avatarDe(etat?.comptes.find((c) => c.actif)?.avatar)
  actif.current = etat?.actif ?? null
  const enCours = !!projet && !!etat?.enCours.includes(projet.id)
  /** Les autres projets où Tako travaille, ou qui attendent ton accord, pendant qu'on regarde celui-ci. */
  const ailleurs = etat ? etat.projets.filter((p) => p.id !== projet?.id && (etat.enCours.includes(p.id) || etat.attend.includes(p.id))) : []
  const attendent = ailleurs.filter((p) => etat?.attend.includes(p.id)).length

  // Pendant un tour, le message rejoint le travail en cours (le main le glisse).
  const envoyer = (texte: string, pieces: PieceJointe[], citations?: Cite[]): void => {
    if (!projet) return
    window.api.envoyer(texte, pieces, false, citations)
  }

  /** Une sélection dans une réponse de Tako fait apparaître « Répondre » juste au-dessus. */
  const regarderSelection = (): void => {
    const sel = getSelection()
    const texte = sel?.toString().trim() ?? ''
    if (!sel || !texte || !sel.rangeCount) return setSelection(null)
    const dans = (n: Node | null): boolean => !!(n instanceof Element ? n : n?.parentElement)?.closest('.ia')
    if (!dans(sel.anchorNode) || !dans(sel.focusNode)) return setSelection(null)
    const r = sel.getRangeAt(0).getBoundingClientRect()
    setSelection({ texte, x: r.left + r.width / 2, y: r.top, bas: r.bottom })
  }
  const citer = (): void => {
    if (!selection) return
    setBrouillon({ passage: selection.texte, reponse: '', x: selection.x, y: selection.y, bas: selection.bas })
    getSelection()?.removeAllRanges()
    setSelection(null)
  }
  const poserReponse = (): void => {
    if (!brouillon) return
    saisie.current?.citer({ passage: brouillon.passage, reponse: brouillon.reponse.trim() || undefined }, brouillon.n)
    setBrouillon(null)
  }
  const repondre = (id: string, r: Reponse): void => window.api.repondre(id, r)
  const nouvelle = (): void => { if (!enCours) { setFil([]); window.api.nouvelle() } }
  const basculer = (v: Vue): void => setVue(vue === v ? 'chat' : v)
  /** Le menu ⋯ de l'en-tête : plein écran, outils du projet, réglages (cinq icônes en haut, c'était trop). */
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    if (!menu) return
    const fermer = (e: PointerEvent): void => { if (!(e.target as Element).closest('.menu-entete, .plus')) setMenu(false) }
    const echap = (e: KeyboardEvent): void => { if (e.key === 'Escape') setMenu(false) }
    addEventListener('pointerdown', fermer)
    addEventListener('keydown', echap, true)
    return () => { removeEventListener('pointerdown', fermer); removeEventListener('keydown', echap, true) }
  }, [menu])
  const choisir = (f: () => void): void => { setMenu(false); f() }
  // Supprimer un sujet se confirme d'un second clic, dans le menu même.
  const [confirme, setConfirme] = useState(false)
  useEffect(() => { if (!menu) setConfirme(false) }, [menu])
  const ouvrirProjet = (id: string): void => {
    // Libre repart à vide à chaque visite : le main l'efface, on recharge.
    if (id !== filDe.current || etat?.projets.find((p) => p.id === id)?.libre) {
      filDe.current = id
      setFil([])
      setTimeout(() => void montrerFil(id), 120)
    }
    window.api.choisirProjet(id)
    setVue('chat')
    setPalette(false)
    setBascule(false)
  }

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
  else if (!projet) {
    corps = (
      <div className="vide">
        <h3>Choisis un projet</h3>
        <p>Un projet, c'est un dossier. Encre y lit le CLAUDE.md et les outils branchés (Figma, Notion…).</p>
        <button type="button" className="btn pri" onClick={() => window.api.ajouterProjet()}>Ajouter un projet</button>
      </div>
    )
  } else if (vue === 'outils') corps = <OutilsProjet projet={projet} racine={etat?.projets.find((p) => p.id === projet.parent) ?? projet} />
  else {
    corps = (
      <div className="fil" onMouseUp={() => setTimeout(regarderSelection, 0)} onScroll={() => selection && setSelection(null)}>
        {fil.length === 0 && <Accueil />}
        {morceaux(fil).map((m, n, tous) => {
          if (m.type === 'qui') return <div key={m.i} className="qui"><img src={portrait(avatar.espece)} alt="" />{avatar.nom}</div>
          if (m.type === 'etapes') return <Etapes key={m.i} outils={m.outils} enCours={enCours && n === tous.length - 1} />
          const { bloc: x, i } = m
          if (x.type === 'moi') {
            return (
              <div key={i} className={`moi ${x.voix ? 'voix' : ''} ${x.pendant ? 'pendant' : ''}`} title={x.pendant ? 'Envoyé pendant que Tako travaillait' : undefined}>
                {(x.citations ?? (x.citation ? [{ passage: x.citation }] : [])).map((c, j) => (
                  <Fragment key={j}>
                    <div className="cite">{c.passage}</div>
                    {c.reponse && <div className="cite-reponse">{c.reponse}</div>}
                  </Fragment>
                ))}
                {x.voix && <span className="dit-voix"><Micro /></span>}
                {x.texte}
                {x.pieces?.length ? <div className="jointes">{x.pieces.map((n, j) => <span key={j}>{n}</span>)}</div> : null}
              </div>
            )
          }
          if (x.type === 'ia') return <div key={i} className="ia"><Markdown texte={x.texte} /></div>
          if (x.type === 'demande') return <Demande key={i} d={x.demande} repondre={(r) => repondre(x.demande.id, r)} />
          if (x.type === 'info') return <div key={i} className="info">{x.texte}</div>
          if (x.type === 'outil') return null
          if (x.erreur) return <div key={i} className="erreur">{x.erreur}</div>
          // Les réponses proposées par Tako : seulement sous la dernière réponse, une fois le tour fini.
          const proposer = !!x.suites?.length && !enCours && n === tous.length - 1
          return (
            <Fragment key={i}>
              <div className="fait" title={x.fil ? 'Mémoire : la conversation que Claude relit à chaque action. Ce tour : ce qu’a consommé cette réponse, en jetons (relu en cache = un dixième).' : undefined}>
                {/* Une seule ligne, coupée en … si le panneau est étroit (elle passait sur deux). */}
                <span className="fait-texte">Fait en {duree(x.duree)}{x.modele ? ` · ${x.modele}` : ''}{x.fil ? ` · mémoire ${k(x.fil)}` : ''}{x.cout ? ` · ce tour ${k(x.cout)}` : ''}</span>
                {/* Un fil lourd coûte à chaque action : Tako écrit ses notes et repart léger (seul au-delà de 200 k). */}
                {n === tous.length - 1 && !enCours && !projet.libre && (x.fil ?? 0) >= 100_000 && (
                  <button type="button" className="ranger" title="Tako écrit ses notes de reprise et repart d’une conversation légère. Le fil affiché ne change pas." onClick={() => window.api.ranger(projet.id)}>Alléger</button>
                )}
              </div>
              {proposer && (
                <div className="suites" aria-label="Réponses proposées">
                  {x.suites!.map((t) => <button key={t} type="button" onClick={() => envoyer(t, [])}>{t}</button>)}
                </div>
              )}
            </Fragment>
          )
        })}
        {enCours && humeur !== 'accord' && <div className="attente"><i /><i /><i /></div>}
        <div ref={bas} />
      </div>
    )
  }

  const titres: Partial<Record<Vue, [string, string]>> = {
    reglages: ['Réglages', 'Général, voix, comptes'],
    outils: ['Outils', projet?.nom ?? '']
  }
  const titre = titres[vue]
  /** Le fil vide : la question au centre, le champ dessous, le poulpe dans le coin. */
  const accueil = vue === 'chat' && !!projet && fil.length === 0 && !!etat?.claude.installe
  const compte = etat?.comptes.find((c) => c.actif)
  const compteActif = (etat?.comptes.length ?? 0) > 1 ? compte?.email ?? compte?.nom : null

  return (
    <div
      className={`panneau ${plein ? 'plein' : ''} ${anim.etat}`}
      style={{ '--mood': COULEURS[parole.actif && parole.phase === 'ecoute' ? 'ecoute' : humeur], '--ox': `${anim.x - 10}px`, '--oy': `${anim.y - 10}px`, '--r': `${rayonEncre(anim.x - 10, anim.y - 10)}px` } as React.CSSProperties}
      // Le cercle d'encre restait figé une fois l'ouverture finie : calculé pour le
      // petit panneau, il coupait le coin opposé en plein écran (bord en biais, 10/11).
      onAnimationEnd={(e) => { if (e.target === e.currentTarget && e.animationName === 'encre-ouvre') setAnim((a) => (a.etat === 'entre' ? { ...a, etat: '' } : a)) }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setGlisse(true) } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setGlisse(false) }}
      onDrop={(e) => void deposer(e)}
    >
      {/* La couleur du projet ne teinte que le chat : réglages et outils restent neutres (audit UI du 18/11). */}
      <div className={`colonne ${vue === 'chat' ? 'teinte' : ''} ${accueil ? 'accueil-vide' : ''}`}>
      {accueil && <Creature avatar={avatar} humeur={humeur} pose="coin" />}
      <header>
        {!accueil && <button type="button" className={`projet ${palette ? 'on' : ''}`} onClick={() => setPalette((x) => !x)} aria-haspopup="dialog" aria-expanded={palette}
          title={`Aller à un projet ou un sujet (${RACCOURCI})${projet?.dossier ? ` · ${projet.dossier}` : ''}`}>
          {/* Hors du chat, l'en-tête dit seulement où l'on est : pas de pastille du projet. */}
          {!titre && (
            <span className={`tag ${projet?.libre ? 'libre' : ''}`} style={projet?.libre ? undefined : { background: racine?.couleur }}>
              {projet?.libre ? '✦' : racine ? initiales(racine.nom) : '+'}
            </span>
          )}
          <span className="noms">
            {/* Un seul repère : le projet, puis le sujet. En petit, le sujet d'abord et le projet dessous. */}
            <strong>
              {titre?.[0] ?? (projet?.libre ? 'Libre' : projet?.parent ? (plein ? <>{racine?.nom}<span className="sep">›</span>{projet.nom}</> : projet.nom) : racine?.nom ?? 'Aucun projet')}
            </strong>
            {titre && <small>{titre[1]}</small>}
          </span>
          <span className="chevron"><Chevron haut={palette} /></span>
          {plein && !titre && <kbd className="raccourci">{RACCOURCI}</kbd>}
        </button>}
        {vue === 'chat' && !accueil && etat && <SelecteurCompte etat={etat} projet={projet} />}
        <div className="actions">
          {ailleurs.length > 0 && !accueil && (
            <button type="button" className={`autres ${attendent ? 'attend' : ''}`} onClick={() => setPalette(true)}
              title={`Tako travaille aussi sur ${ailleurs.map((p) => (p.libre ? 'Libre' : p.nom)).join(', ')}`}>
              <i className={`activite ${attendent ? 'attend' : 'travaille'}`} />
              {plein ? (attendent ? `${attendent} attend${attendent > 1 ? 'ent' : ''}` : `${ailleurs.length} en cours`) : attendent || ailleurs.length}
            </button>
          )}
          {avant && vue === 'chat' && (
            <button type="button" className="retour" onClick={() => ouvrirProjet(avant.id)} title={`Revenir à ${avant.libre ? 'Libre' : avant.nom} (Ctrl+Tab pour les autres)`}>
              ← <span>{avant.libre ? 'Libre' : avant.nom}</span>
            </button>
          )}
          {vue === 'outils' || vue === 'reglages'
            ? <button type="button" className="icone" title="Revenir à la conversation" onClick={() => setVue('chat')}>←</button>
            : vue === 'chat' && !accueil && <button type="button" className={`icone nouvelle ${plein ? 'avec-texte' : ''}`} title="Nouvelle conversation (repart de zéro dans ce sujet)" onClick={nouvelle} disabled={enCours || !projet}>＋{plein && ' Nouvelle conversation'}</button>}
          <button type="button" className={`icone plus ${menu || vue === 'outils' || vue === 'reglages' ? 'on' : ''}`} title="Plus" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>⋯</button>
          {/* Toujours dans la page (caché fermé) : la vérification sans écran clique ces boutons. */}
          <div className={`menu-entete ${menu ? 'ouvert' : ''}`} role="menu">
            {/* Un seul ⋯ : le sujet (ou le projet) ouvert, puis Encre. Supprimer un projet reste au clic droit, avec confirmation. */}
            {projet && !projet.libre && vue === 'chat' && (
              <>
                <small className="section">{projet.parent ? `Sujet · ${projet.nom}` : `Projet · ${projet.nom}`}</small>
                <button type="button" role="menuitem" onClick={() => choisir(() => window.api.actionCarte(projet.id, 'renommer'))}>Renommer…</button>
                <button type="button" role="menuitem" onClick={() => choisir(() => window.api.actionCarte(projet.id, 'dossier'))}>Ouvrir le dossier</button>
                {projet.parent && (
                  <button type="button" role="menuitem" className="danger" disabled={enCours}
                    onClick={() => (confirme ? choisir(() => window.api.actionCarte(projet.id, 'supprimer')) : setConfirme(true))}>
                    {confirme ? 'Confirmer : supprimer ce sujet' : 'Supprimer ce sujet…'}
                  </button>
                )}
                <small className="section">Encre</small>
              </>
            )}
            <button type="button" role="menuitem" data-action="plein" onClick={() => choisir(() => window.api.pleinEcran())}>
              {plein ? <Reduire /> : <Agrandir />}{plein ? 'Revenir à la bulle' : 'Plein écran'}
            </button>
            <button type="button" role="menuitem" data-vue="outils" className={vue === 'outils' ? 'on' : ''} disabled={!projet} onClick={() => choisir(() => basculer('outils'))}>
              <Prise />Outils du projet
            </button>
            <button type="button" role="menuitem" data-vue="reglages" className={vue === 'reglages' ? 'on' : ''} onClick={() => choisir(() => basculer('reglages'))}>
              <Roue />Réglages
            </button>
            {projet && etat && vue === 'chat' && (
              <>
                <small className="section">Ce que {avatar.nom} peut faire seul</small>
                <div className="modes" role="radiogroup" aria-label="Autorisations">
                  {MODES.map((m) => (
                    <button key={m.id} type="button" role="radio" aria-checked={projet.mode === m.id} title={m.aide}
                      className={projet.mode === m.id ? 'on' : ''} onClick={() => window.api.mode(m.id)}>
                      {m.nom}
                    </button>
                  ))}
                </div>
                <div className="pied"><Jauges limites={etat.limites} compte={compteActif} /></div>
              </>
            )}
          </div>
        </div>
      </header>

      {corps}

      {glisse && <div className="depot">Lâche pour joindre</div>}

      {renomme && (
        <form
          className="renommer"
          onSubmit={(e) => { e.preventDefault(); window.api.renommer(renomme.id, renomme.nom); setRenomme(null) }}
        >
          <strong>Renommer</strong>
          <input
            autoFocus
            value={renomme.nom}
            onChange={(e) => setRenomme({ ...renomme, nom: e.target.value })}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setRenomme(null) } }}
          />
          <div>
            <button type="button" onClick={() => setRenomme(null)}>Annuler</button>
            <button type="submit" className="ok" disabled={!renomme.nom.trim()}>Renommer</button>
          </div>
        </form>
      )}

      {selection && vue === 'chat' && (
        <button
          type="button"
          className="repondre-a"
          style={{ left: selection.x, top: selection.y }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={citer}
        >
          ↳ Répondre
        </button>
      )}

      {brouillon && vue === 'chat' && (
        <BulleReponse
          brouillon={brouillon}
          changer={(reponse) => setBrouillon({ ...brouillon, reponse })}
          poser={poserReponse}
          fermer={() => { setBrouillon(null); saisie.current?.focus() }}
        />
      )}

      {projet && vue === 'chat' && etat?.claude.installe && (
        <footer>
          {parole.erreur && !parole.actif && <p className="erreur-voix">{parole.erreur}</p>}
          {limitePleine(etat.limites) && <p className="erreur-voix">{limitePleine(etat.limites)}</p>}
          {muet && <p className="voix-muette">Tako répond par écrit : limite gratuite de la voix atteinte{muet.secondes < 0 ? ' pour aujourd’hui, elle revient demain à 9 h' : muet.secondes ? `, elle revient dans ${muet.secondes} s` : ''}.</p>}
          {parole.actif
            ? <Appel parole={parole} avatar={avatar} humeur={humeur} grand={plein} touche={etat.toucheParler} />
            : (
              <div className="champ-zone">
                {/* La tête qui guette : en plein écran seulement, en petit elle couvrait le fil (26/11). */}
                {!accueil && plein && <Creature avatar={avatar} humeur={humeur} pose="guetteur" />}
                <Saisie ref={saisie} invite={`${accueil ? 'Demande' : 'Réponds'} à ${avatar.nom}…`} enCours={enCours} envoyer={envoyer} arreter={() => window.api.arreter()} parler={() => parole.basculer()} projet={projet.id}
                  corriger={(c, n, cadre) => setBrouillon({ passage: c.passage, reponse: c.reponse ?? '', x: cadre.left + cadre.width / 2, y: cadre.top, bas: cadre.bottom, n })} />
              </div>
            )}
          {accueil && !projet.libre && (
            <button type="button" className="cible" onClick={() => setPalette(true)} title={`Changer de projet (${RACCOURCI})`}>
              <span className="tag" style={{ background: racine?.couleur }}>{initiales(racine?.nom ?? projet.nom)}</span>
              Dans <b>{projet.parent ? `${racine?.nom} › ${projet.nom}` : projet.nom}</b> <Chevron />
            </button>
          )}
          {/* Les limites ne remontent sous le champ que quand elles approchent (80 %) : sinon elles sont dans le ⋯. */}
          {limiteHaute(etat.limites) && <div className="pied"><Jauges limites={etat.limites} compte={compteActif} /></div>}
        </footer>
      )}
      {accueil && etat && projet && <EnAttente etat={etat} projet={projet} ouvrir={ouvrirProjet} palette={() => setPalette(true)} raccourci={RACCOURCI} />}
      {palette && etat && <Palette etat={etat} ouvrir={ouvrirProjet} fermer={() => setPalette(false)} />}
      {bascule && etat && <Bascule etat={etat} vus={vus.current} ouvrir={ouvrirProjet} fermer={() => setBascule(false)} />}
      </div>
    </div>
  )
}

/**
 * La petite bulle qui sort de « Répondre » : le passage en rappel, un champ pour
 * la réponse, « Ajouter ». Posée au-dessus du passage, ou dessous s'il est trop
 * haut, et gardée dans la fenêtre.
 */
function BulleReponse({ brouillon, changer, poser, fermer }: {
  brouillon: { passage: string; reponse: string; x: number; y: number; bas: number; n?: number }
  changer: (reponse: string) => void
  poser: () => void
  fermer: () => void
}): JSX.Element {
  const zone = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const z = zone.current
    if (!z) return
    z.focus()
    z.setSelectionRange(z.value.length, z.value.length)
  }, [])
  const largeur = Math.min(320, window.innerWidth - 24)
  const gauche = Math.min(Math.max(brouillon.x - largeur / 2, 12), window.innerWidth - largeur - 12)
  const dessous = brouillon.y < 230
  const style: React.CSSProperties = dessous
    ? { left: gauche, top: brouillon.bas + 8, width: largeur }
    : { left: gauche, top: brouillon.y - 8, width: largeur, transform: 'translateY(-100%)' }
  return (
    <>
      <div className="voile-reponse" onMouseDown={fermer} />
      <div className="bulle-reponse" style={style} role="dialog" aria-label="Répondre à ce passage">
        <div className="rappel"><span className="trait" /><span>{brouillon.passage}</span></div>
        <textarea
          ref={zone}
          rows={2}
          value={brouillon.reponse}
          placeholder="Ta réponse à ce passage…"
          onChange={(e) => changer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); fermer() }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); poser() }
          }}
        />
        <div className="actions">
          <button type="button" className="annuler" onClick={fermer}>Annuler</button>
          <button type="button" className="ajouter" onClick={poser}>{brouillon.n !== undefined ? 'Corriger' : 'Ajouter'}</button>
        </div>
      </div>
    </>
  )
}
