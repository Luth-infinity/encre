import { useState } from 'react'
import { VOIX, VOIX_GEMINI, type Etat, type Reglages as R } from '@shared/types'

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
function Cle({ nom, presente, prefixe, aide, enregistrer }: { nom: string; presente: boolean; prefixe: string; aide: string; enregistrer: (v: string | null) => Promise<string | null> }): JSX.Element {
  const [cle, setCle] = useState('')
  const [remplacer, setRemplacer] = useState(false)
  const [souci, setSouci] = useState<string | null>(null)
  const envoyer = async (valeur: string | null): Promise<void> => {
    if (valeur !== null && !valeur.trim().startsWith(prefixe)) return setSouci(`Une clé ${nom} commence par « ${prefixe} ».`)
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
            <input type="password" placeholder={`Clé ${nom} (${prefixe}…)`} value={cle} onChange={(e) => setCle(e.target.value)} autoComplete="off" spellCheck={false} />
            <button type="submit" className="btn pri" disabled={!cle.trim()}>Enregistrer</button>
          </form>
        )}
      {!presente && <p className="aide">{aide}</p>}
      {souci && <p className="erreur">{souci}</p>}
    </>
  )
}

/** Les réglages d'Encre : la voix, le démarrage, et l'état du Claude Code de la machine. */
export default function Reglages({ etat }: { etat: Etat }): JSX.Element {
  const r = etat.reglages
  const poser = (champs: Partial<R>): void => window.api.reglages(champs)
  const [essai, setEssai] = useState(false)
  // Une phrase de Tako dans la voix choisie, jouée ici même.
  const essayer = async (): Promise<void> => {
    setEssai(true)
    const son = await window.api.essaiVoix(r.voix)
    if (!son) return setEssai(false)
    const a = new Audio(`data:${son.startsWith('UklGR') ? 'audio/wav' : 'audio/mpeg'};base64,${son}`)
    a.onended = a.onerror = () => setEssai(false)
    void a.play().catch(() => setEssai(false))
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
        <h4>Voix de Tako</h4>
        <Cle
          nom="Gemini"
          presente={r.cleGemini}
          prefixe="AIza"
          aide="Pour une voix vraiment naturelle (gratuit) : aistudio.google.com → Get API key, puis colle-la ici. Chiffrée par Windows. Sans elle, Tako parle avec une voix Microsoft."
          enregistrer={(v) => window.api.cleGemini(v)}
        />
        <div className="choix-voix">
          {(r.cleGemini ? VOIX_GEMINI : VOIX).map((v) => (
            <button key={v.id} type="button" className={r.voix === v.id ? 'on' : ''} onClick={() => poser({ voix: v.id })} title={'aide' in v ? String(v.aide) : undefined}>
              {v.nom}{'aide' in v && <small>{String(v.aide)}</small>}
            </button>
          ))}
        </div>
        <button type="button" className="btn essai" onClick={() => void essayer()} disabled={essai}>{essai ? 'Tako parle…' : '▶ Tester la voix'}</button>
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

      <p className="version">Encre {etat.version}</p>
    </div>
  )
}
