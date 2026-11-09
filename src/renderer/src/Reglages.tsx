import { useEffect, useState } from 'react'
import { AVATARS, DESCRIPTION_TAKO, VOIX, type ChoixModele, VOIX_GEMINI, type Compte, type Etat, type Reglages as R } from '@shared/types'

function Bascule({ on, changer, titre, aide }: { on: boolean; changer: (v: boolean) => void; titre: string; aide?: string }): JSX.Element {
  return (
    <label className="bascule">
      <span>
        <strong>{titre}</strong>
        {aide && <small>{aide}</small>}
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => changer(e.target.checked)} />
      <i />
    </label>
  )
}

/** Une clé d'API : saisie masquée, puis seulement « enregistrée » (elle ne revient jamais au panneau). */
function Cle({ nom, presente, prefixe, aide, enregistrer }: { nom: string; presente: boolean; prefixe?: string; aide: string; enregistrer: (v: string | null) => Promise<string | null> }): JSX.Element {
  const [cle, setCle] = useState('')
  const [remplacer, setRemplacer] = useState(false)
  const [souci, setSouci] = useState<string | null>(null)
  const envoyer = async (valeur: string | null): Promise<void> => {
    if (valeur !== null && prefixe && !valeur.trim().startsWith(prefixe)) return setSouci(`Une clé ${nom} commence par « ${prefixe} ».`)
    setSouci(null)
    const e = await enregistrer(valeur === null ? null : valeur.trim())
    setSouci(e)
    if (!e) { setCle(''); setRemplacer(false) }
  }
  return (
    <>
      {presente && !remplacer
        ? (
          <div className="ligne">
            <span className="statut ok">Clé {nom} enregistrée</span>
            <button type="button" className="lien" onClick={() => setRemplacer(true)}>Remplacer</button>
            <button type="button" className="lien" onClick={() => void envoyer(null)}>Retirer</button>
          </div>
        )
        : (
          <form className="ligne" onSubmit={(e) => { e.preventDefault(); void envoyer(cle) }}>
            <input type="password" placeholder={prefixe ? `Clé ${nom} (${prefixe}…)` : `Clé ${nom}`} value={cle} onChange={(e) => setCle(e.target.value)} autoComplete="off" spellCheck={false} />
            <button type="submit" className="btn pri" disabled={!cle.trim()}>Enregistrer</button>
          </form>
        )}
      {!presente && <p className="aide">{aide}</p>}
      {souci && <p className="erreur">{souci}</p>}
    </>
  )
}

const jouer = (son: string, fin: () => void): void => {
  const a = new Audio(`data:${son.startsWith('UklGR') ? 'audio/wav' : 'audio/mpeg'};base64,${son}`)
  a.onended = a.onerror = () => fin()
  void a.play().catch(() => fin())
}

/**
 * Créer la voix de Tako : une description, Google fabrique la voix (Gemini
 * « voice design ») et rend un échantillon. Elle est choisie aussitôt.
 */
function CreerVoix(): JSX.Element {
  const [ouvert, setOuvert] = useState(false)
  const [description, setDescription] = useState(DESCRIPTION_TAKO)
  const [etat, setEtat] = useState<'' | 'cree' | 'joue'>('')
  const [souci, setSouci] = useState<string | null>(null)
  const creer = async (): Promise<void> => {
    setEtat('cree')
    setSouci(null)
    const { son, erreur } = await window.api.creerVoix(description)
    if (erreur) {
      setSouci(erreur)
      return setEtat('')
    }
    setOuvert(false)
    if (son) {
      setEtat('joue')
      jouer(son, () => setEtat(''))
    } else setEtat('')
  }
  if (!ouvert) {
    return <button type="button" className="btn creer-voix" onClick={() => setOuvert(true)}>✦ Créer la voix de Tako</button>
  }
  return (
    <div className="nouvelle-voix">
      <strong>Décris la voix de Tako</strong>
      <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      <small>Google la fabrique à partir de ta description. Tu peux en créer plusieurs et garder ta préférée.</small>
      {souci && <p className="erreur">{souci}</p>}
      <div className="btns">
        <button type="button" className="btn" onClick={() => setOuvert(false)} disabled={etat === 'cree'}>Annuler</button>
        <button type="button" className="btn pri" onClick={() => void creer()} disabled={etat === 'cree' || description.trim().length < 20}>
          {etat === 'cree' ? 'Google fabrique la voix…' : 'Créer cette voix'}
        </button>
      </div>
    </div>
  )
}

/** Un nom court par choix (sur une ligne), et une phrase pour le choix en cours. */
const MODELES: [ChoixModele, string, string][] = [
  ['auto', 'Auto', 'Sonnet pour le simple, Opus pour ce qui demande de réfléchir (trié par Haiku). Dans une longue conversation, Tako garde le même modèle : en changer ferait tout relire et vider tes limites plus vite.'],
  ['sonnet', 'Sonnet', 'Toujours Sonnet : rapide, et plus léger pour tes limites.'],
  ['opus', 'Opus', 'Toujours Opus : le plus fort, et le plus gourmand.'],
  ['claude', 'Claude Code', 'Le modèle réglé dans Claude Code (commande /model).']
]

type Onglet = 'general' | 'voix' | 'comptes'
const ONGLETS: [Onglet, string][] = [['general', 'Général'], ['voix', 'Voix'], ['comptes', 'Comptes']]

/**
 * Les comptes Claude : on passe de l'un à l'autre d'un clic (le perso, celui
 * du boulot). Les conversations suivent, seule la connexion change.
 */
function Comptes({ comptes }: { comptes: Compte[] }): JSX.Element {
  const [ajout, setAjout] = useState(false)
  const [nom, setNom] = useState('')
  /** Le compte dont la fenêtre de connexion est ouverte. */
  const [enCours, setEnCours] = useState<string | null>(null)
  const [souci, setSouci] = useState<string | null>(null)
  const connecter = async (id: string): Promise<void> => {
    setEnCours(id)
    setSouci(null)
    const erreur = await window.api.connecterCompte(id)
    setEnCours(null)
    setSouci(erreur)
  }
  const ajouter = async (): Promise<void> => {
    const id = await window.api.ajouterCompte(nom)
    setNom('')
    setAjout(false)
    await connecter(id)
  }
  return (
    <div className="comptes">
      {comptes.map((c) => (
        <div key={c.id} className={`compte ${c.actif ? 'on' : ''}`}>
          <button type="button" className="choisir" role="radio" aria-checked={c.actif} onClick={() => !c.actif && window.api.choisirCompte(c.id)} title={c.actif ? 'Compte en cours' : 'Passer sur ce compte'}>
            <i />
            <span>
              <strong>{c.nom}{c.principal ? <em> · celui du terminal</em> : null}</strong>
              <small>{enCours === c.id ? 'Connexion dans la fenêtre ouverte…' : c.email ?? 'Pas encore connecté'}{c.offre && c.email && enCours !== c.id ? ` · ${c.offre}` : ''}</small>
            </span>
          </button>
          <select className="avatar" value={c.avatar} onChange={(e) => window.api.choisirAvatar(c.id, e.target.value)} title="L’avatar de ce compte : son apparence, son nom et son ton">
            {AVATARS.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
          {enCours !== c.id && !c.connecte && <button type="button" className="btn pri" disabled={!!enCours} onClick={() => void connecter(c.id)}>Se connecter</button>}
          {enCours !== c.id && c.connecte && <button type="button" className="lien-discret" disabled={!!enCours} onClick={() => void connecter(c.id)} title="Rouvrir la connexion (expirée, ou autre adresse)">Reconnecter</button>}
          {!c.principal && enCours !== c.id && <button type="button" className="lien-discret" onClick={() => window.api.retirerCompte(c.id)} title="Retirer d’Encre (le compte Claude, lui, ne bouge pas)">Retirer</button>}
        </div>
      ))}
      {souci && <p className="erreur-voix">{souci}</p>}
      {ajout ? (
        <form className="ajout-compte" onSubmit={(e) => { e.preventDefault(); void ajouter() }}>
          <input autoFocus placeholder="Nom (ex. Perso, Travail)" value={nom} onChange={(e) => setNom(e.target.value)} />
          <button type="button" className="btn" onClick={() => setAjout(false)}>Annuler</button>
          <button type="submit" className="btn pri" disabled={!nom.trim()}>Ajouter</button>
        </form>
      ) : (
        <button type="button" className="btn ajouter-compte" disabled={!!enCours} onClick={() => setAjout(true)}>＋ Ajouter un compte</button>
      )}
      <p className="aide">Une fenêtre de connexion vierge s’ouvre : connecte-toi avec le compte voulu, même si ton navigateur est sur un autre. Les conversations, skills et réglages restent les mêmes ; les outils reliés (Figma…) sont à relier à nouveau sur ce compte.</p>
    </div>
  )
}

/** Les réglages d'Encre : la voix, le démarrage, et l'état du Claude Code de la machine. */
export default function Reglages({ etat }: { etat: Etat }): JSX.Element {
  const r = etat.reglages
  const poser = (champs: Partial<R>): void => window.api.reglages(champs)
  const [essai, setEssai] = useState(false)
  const [souciEssai, setSouciEssai] = useState<string | null>(null)
  // Une phrase de Tako dans la voix choisie, jouée ici même.
  const essayer = async (): Promise<void> => {
    setEssai(true)
    setSouciEssai(null)
    const { son, erreur } = await window.api.essaiVoix(r.voix)
    if (!son) {
      setSouciEssai(erreur ?? null)
      return setEssai(false)
    }
    jouer(son, () => setEssai(false))
  }

  const [onglet, setOnglet] = useState<Onglet>('general')
  const voix = [...(r.cleGemini ? VOIX_GEMINI : []), ...VOIX]
  // Les voix ElevenLabs du compte, relues en ouvrant l'onglet (une voix ajoutée sur le site apparaît).
  const [eleven, setEleven] = useState<{ id: string; nom: string; aide: string }[]>([])
  const [souciEleven, setSouciEleven] = useState<string | null>(null)
  useEffect(() => {
    if (onglet !== 'voix' || !r.cleEleven) return setEleven([])
    void window.api.voixEleven().then(({ voix, erreur }) => {
      setEleven(voix)
      setSouciEleven(erreur ?? null)
    })
  }, [onglet, r.cleEleven])

  return (
    <div className="page">
      <div className="onglets" role="tablist">
        {ONGLETS.map(([id, nom]) => (
          <button key={id} type="button" role="tab" aria-selected={onglet === id} className={onglet === id ? 'on' : ''} onClick={() => setOnglet(id)}>{nom}</button>
        ))}
      </div>

      {onglet === 'general' && (
        <>
          <section>
            <div className="statut-ligne">
              <h4>Claude Code</h4>
              <p className={`statut ${etat.claude.connecte ? 'ok' : 'ko'}`}>
                {etat.claude.installe ? (etat.claude.connecte ? 'Installé et connecté' : 'Connexion expirée') : 'Pas installé'}
              </p>
            </div>
            {etat.claude.installe && !etat.claude.connecte && (
              <p className="aide">Connexion expirée : « Se connecter » dans l’onglet Comptes.</p>
            )}
          </section>
          <section>
            <h4>Modèle</h4>
            <div className="segments" role="radiogroup">
              {MODELES.map(([id, nom]) => (
                <button key={id} type="button" role="radio" aria-checked={r.modele === id} className={r.modele === id ? 'on' : ''} onClick={() => poser({ modele: id })}>{nom}</button>
              ))}
            </div>
            <p className="aide">{MODELES.find(([id]) => id === r.modele)?.[2]}</p>
          </section>
          <section>
            <h4>Démarrage</h4>
            <Bascule on={r.demarrage} changer={(v) => poser({ demarrage: v })} titre="Lancer Encre avec Windows" />
          </section>
          {etat.majPrete && (
            <div className="maj-prete">
              <span><strong>Version {etat.majPrete} prête</strong><small>Encre se ferme et se rouvre, quelques secondes.</small></span>
              <button type="button" className="btn pri" onClick={() => window.api.installerMaj()}>Mettre à jour</button>
            </div>
          )}
          <p className="version">Encre {etat.version}</p>
        </>
      )}

      {onglet === 'voix' && (
        <>
          <section>
            <h4>Voix de Tako</h4>
            <div className="liste-voix" role="radiogroup">
              {eleven.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={r.voix === v.id} className={`perso ${r.voix === v.id ? 'on' : ''}`} onClick={() => poser({ voix: v.id })}>
                  {v.nom}<small>ElevenLabs · {v.aide}</small>
                </button>
              ))}
              {r.cleGemini && r.voixPerso.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={r.voix === `gemini:${v.id}`} className={`perso ${r.voix === `gemini:${v.id}` ? 'on' : ''}`} onClick={() => poser({ voix: `gemini:${v.id}` })} title={v.description}>
                  ✦ {v.nom}<small>Sur mesure</small>
                </button>
              ))}
              {voix.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={r.voix === v.id} className={r.voix === v.id ? 'on' : ''} onClick={() => poser({ voix: v.id })}>
                  {v.nom}<small>{'aide' in v ? String(v.aide) : 'Illimitée'}</small>
                </button>
              ))}
            </div>
            <button type="button" className="btn essai" onClick={() => void essayer()} disabled={essai}>{essai ? 'Tako parle…' : '▶ Tester la voix'}</button>
            {souciEssai && <p className="erreur">{souciEssai}</p>}
            {souciEleven && <p className="erreur">{souciEleven}</p>}
            {r.cleEleven && <p className="aide">Les voix de ton compte ElevenLabs : pour en ajouter une, Voice Library sur elevenlabs.io → « Add to my voices », puis reviens sur cet onglet. Modèle Flash : rapide, deux fois moins de crédits. Crédits épuisés : Tako répond par écrit.</p>}
            {r.cleGemini && r.voixPerso.some((v) => r.voix === `gemini:${v.id}`) && (
              <button type="button" className="lien" onClick={() => window.api.oublierVoix(r.voix.slice('gemini:'.length))}>Oublier cette voix</button>
            )}
            {r.cleGemini && <p className="aide">Voix Gemini : quota gratuit limité, Tako répond par écrit quand il est atteint. « Illimitée » : voix Microsoft, gratuites et sans limite.</p>}
          </section>
          <section>
            <h4>Parler</h4>
            <Bascule on={r.veille} changer={(v) => poser({ veille: v })} titre="Réveil au mot « Tako »" aide="Reconnaissance sur la machine, rien ne sort." />
          </section>
          <section>
            <h4>Clés</h4>
            <Cle
              nom="Groq"
              presente={r.cleGroq}
              prefixe="gsk_"
              aide="Pour transcrire ta voix (gratuit) : console.groq.com → API Keys. Chiffrée par Windows."
              enregistrer={(v) => window.api.cleGroq(v)}
            />
            <Cle
              nom="ElevenLabs"
              presente={r.cleEleven}
              aide="Pour les voix ElevenLabs : elevenlabs.io → profil → API Keys → Create (droits Text to Speech et Voices : Read). Chiffrée par Windows."
              enregistrer={(v) => window.api.cleEleven(v)}
            />
            <Cle
              nom="Gemini"
              presente={r.cleGemini}
              aide="Facultative, pour des voix plus naturelles (quota gratuit limité) : aistudio.google.com → Get API key. Chiffrée par Windows."
              enregistrer={(v) => window.api.cleGemini(v)}
            />
            {r.cleGemini && <CreerVoix />}
          </section>
        </>
      )}

      {onglet === 'comptes' && (
        <section>
          <h4>Comptes Claude</h4>
          {etat.claude.installe ? <Comptes comptes={etat.comptes} /> : <p className="aide">Installe d’abord Claude Code.</p>}
        </section>
      )}
    </div>
  )
}
