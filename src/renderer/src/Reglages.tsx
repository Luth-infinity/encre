import { useState } from 'react'
import { VOIX, type Etat, type Reglages as R } from '@shared/types'

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

/** Les réglages d'Encre : la voix, le démarrage, et l'état du Claude Code de la machine. */
export default function Reglages({ etat }: { etat: Etat }): JSX.Element {
  const r = etat.reglages
  const poser = (champs: Partial<R>): void => window.api.reglages(champs)
  const [cle, setCle] = useState('')
  const [remplacer, setRemplacer] = useState(false)
  const [souci, setSouci] = useState<string | null>(null)

  const enregistrer = async (valeur: string | null): Promise<void> => {
    if (valeur !== null && !valeur.trim().startsWith('gsk_')) return setSouci('Une clé Groq commence par « gsk_ ».')
    const e = await window.api.cleGroq(valeur)
    setSouci(e)
    if (!e) { setCle(''); setRemplacer(false) }
  }

  return (
    <div className="page">
      <section>
        <h4>Claude Code</h4>
        <p className={`statut ${etat.claude.connecte ? 'ok' : 'ko'}`}>
          {etat.claude.installe ? (etat.claude.connecte ? 'Installé et connecté' : 'Connexion expirée') : 'Pas installé'}
        </p>
        {etat.claude.installe && (
          <p className="aide">Si un message répond « connexion expirée » : ouvre un terminal, lance <code>claude</code>, puis tape <code>/login</code>.</p>
        )}
      </section>

      <section>
        <h4>Parler</h4>
        {r.cleGroq && !remplacer
          ? (
            <div className="ligne">
              <span className="statut ok">Clé Groq enregistrée</span>
              <button type="button" className="lien" onClick={() => setRemplacer(true)}>Remplacer</button>
              <button type="button" className="lien" onClick={() => void enregistrer(null)}>Retirer</button>
            </div>
          )
          : (
            <form className="ligne" onSubmit={(e) => { e.preventDefault(); void enregistrer(cle) }}>
              <input type="password" placeholder="Clé Groq (gsk_…)" value={cle} onChange={(e) => setCle(e.target.value)} autoComplete="off" spellCheck={false} />
              <button type="submit" className="btn pri" disabled={!cle.trim()}>Enregistrer</button>
            </form>
          )}
        {!r.cleGroq && <p className="aide">Pour transcrire ta voix (gratuit) : console.groq.com → API Keys. Chiffrée par Windows.</p>}
        {souci && <p className="erreur">{souci}</p>}
        <div className="choix-voix">
          {VOIX.map((v) => (
            <button key={v.id} type="button" className={r.voix === v.id ? 'on' : ''} onClick={() => poser({ voix: v.id })}>{v.nom}</button>
          ))}
        </div>
        <Bascule on={r.veille} changer={(v) => poser({ veille: v })} titre="Réveil au mot « Encre »" aide="Reconnaissance sur la machine, rien ne sort." />
        <Bascule on={r.suite} changer={(v) => poser({ suite: v })} titre="Enchaîner" aide="Après une réponse, le micro se rouvre quelques secondes." />
      </section>

      <section>
        <h4>Démarrage</h4>
        <Bascule on={r.demarrage} changer={(v) => poser({ demarrage: v })} titre="Lancer Encre avec Windows" />
      </section>

      <p className="version">Encre {etat.version}</p>
    </div>
  )
}
