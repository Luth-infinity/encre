import { useState } from 'react'
import { DESCRIPTION_TAKO, VOIX, VOIX_GEMINI, type Compte, type Etat, type Reglages as R } from '@shared/types'

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

/**
 * Les comptes Claude : on passe de l'un à l'autre d'un clic (le perso, celui
 * du boulot). Les conversations suivent, seule la connexion change.
 */
function Comptes({ comptes }: { comptes: Compte[] }): JSX.Element {
  const [ajout, setAjout] = useState(false)
  const [nom, setNom] = useState('')
  return (
    <div className="comptes">
      {comptes.map((c) => (
        <div key={c.id} className={`compte ${c.actif ? 'on' : ''}`}>
          <button type="button" className="choisir" role="radio" aria-checked={c.actif} onClick={() => !c.actif && window.api.choisirCompte(c.id)} title={c.actif ? 'Compte utilisé par Tako' : 'Passer sur ce compte'}>
            <i />
            <span>
              <strong>{c.nom}{c.principal ? <em> · celui du terminal</em> : null}</strong>
              <small>{c.email ?? 'Pas encore connecté'}{c.offre && c.email ? ` · ${c.offre}` : ''}</small>
            </span>
          </button>
          {!c.connecte && <button type="button" className="btn pri" onClick={() => window.api.connecterCompte(c.id)}>Se connecter</button>}
          {c.connecte && <button type="button" className="lien-discret" onClick={() => window.api.connecterCompte(c.id)} title="Rouvrir la connexion (expirée, ou autre adresse)">Reconnecter</button>}
          {!c.principal && <button type="button" className="lien-discret" onClick={() => window.api.retirerCompte(c.id)} title="Retirer d’Encre (le compte Claude, lui, ne bouge pas)">Retirer</button>}
        </div>
      ))}
      {ajout ? (
        <form className="ajout-compte" onSubmit={(e) => { e.preventDefault(); window.api.ajouterCompte(nom); setNom(''); setAjout(false) }}>
          <input autoFocus placeholder="Nom (ex. Perso, Posidea)" value={nom} onChange={(e) => setNom(e.target.value)} />
          <button type="button" className="btn" onClick={() => setAjout(false)}>Annuler</button>
          <button type="submit" className="btn pri" disabled={!nom.trim()}>Ajouter</button>
        </form>
      ) : (
        <button type="button" className="btn ajouter-compte" onClick={() => setAjout(true)}>＋ Ajouter un compte</button>
      )}
      <p className="aide">Un nouveau compte ouvre une fenêtre de connexion : connecte-toi dans le navigateur avec la bonne adresse. Les conversations, skills et réglages restent les mêmes ; les outils reliés (Figma…) sont à relier à nouveau sur ce compte.</p>
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

  return (
    <div className="page">
      <section>
        <h4>Claude Code</h4>
        <p className={`statut ${etat.claude.connecte ? 'ok' : 'ko'}`}>
          {etat.claude.installe ? (etat.claude.connecte ? 'Installé et connecté' : 'Connexion expirée') : 'Pas installé'}
        </p>
        {etat.claude.installe && !etat.claude.connecte && (
          <p className="aide">Connexion expirée : clique « Se connecter » ou « Reconnecter » sur le compte ci-dessous.</p>
        )}
      </section>

      {etat.claude.installe && (
        <section>
          <h4>Comptes Claude</h4>
          <Comptes comptes={etat.comptes} />
        </section>
      )}

      <section>
        <h4>Voix de Tako</h4>
        <Cle
          nom="Gemini"
          presente={r.cleGemini}
          aide="Pour une voix vraiment naturelle (gratuit) : aistudio.google.com → Get API key, puis colle-la ici. Chiffrée par Windows. Sans elle, Tako parle avec une voix Microsoft."
          enregistrer={(v) => window.api.cleGemini(v)}
        />
        <div className="choix-voix">
          {r.cleGemini && r.voixPerso.map((v) => (
            <button key={v.id} type="button" className={`perso ${r.voix === `gemini:${v.id}` ? 'on' : ''}`} onClick={() => poser({ voix: `gemini:${v.id}` })} title={v.description}>
              ✦ {v.nom}<small>Sur mesure</small>
            </button>
          ))}
          {[...(r.cleGemini ? VOIX_GEMINI : []), ...VOIX].map((v) => (
            <button key={v.id} type="button" className={r.voix === v.id ? 'on' : ''} onClick={() => poser({ voix: v.id })} title={'aide' in v ? String(v.aide) : undefined}>
              {v.nom}<small>{'aide' in v ? String(v.aide) : 'Illimitée'}</small>
            </button>
          ))}
        </div>
        <button type="button" className="btn essai" onClick={() => void essayer()} disabled={essai}>{essai ? 'Tako parle…' : '▶ Tester la voix'}</button>
        {souciEssai && <p className="erreur">{souciEssai}</p>}
        {r.cleGemini && <CreerVoix />}
        {r.cleGemini && r.voixPerso.some((v) => r.voix === `gemini:${v.id}`) && (
          <button type="button" className="lien" onClick={() => window.api.oublierVoix(r.voix.slice('gemini:'.length))}>Oublier cette voix</button>
        )}
        {r.cleGemini && <p className="aide">Voix Gemini (sur mesure et autres) : quota gratuit limité, Tako répond par écrit quand il est atteint. Voix « Illimitée » : Microsoft, gratuite et sans limite.</p>}
      </section>

      <section>
        <h4>Parler</h4>
        <Cle
          nom="Groq"
          presente={r.cleGroq}
          prefixe="gsk_"
          aide="Pour transcrire ta voix (gratuit) : console.groq.com → API Keys. Chiffrée par Windows."
          enregistrer={(v) => window.api.cleGroq(v)}
        />
        <Bascule on={r.veille} changer={(v) => poser({ veille: v })} titre="Réveil au mot « Tako »" aide="Reconnaissance sur la machine, rien ne sort." />
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
    </div>
  )
}
