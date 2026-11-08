import { useEffect, useState } from 'react'
import type { CompteFigma, Projet } from '@shared/types'

/** Le serveur Figma officiel n'a pas de nom de compte : on l'appelle simplement « par défaut ». */
const LIBELLES: Record<string, string> = { 'figma-remote-mcp': 'par défaut' }
const libelle = (serveur: string): string => LIBELLES[serveur] ?? serveur.replace(/^figma-/, '')

const ETATS: Record<string, string> = {
  connected: 'branché',
  'needs-auth': 'à reconnecter',
  failed: 'en panne',
  pending: 'en cours',
  disabled: 'coupé'
}

/**
 * Les outils du projet ouvert : ses comptes Figma (un client, un compte),
 * ses jetons (chiffrés par Windows, donnés à Claude Code en variables), et
 * l'état des serveurs MCP au dernier message.
 */
export default function OutilsProjet({ projet }: { projet: Projet }): JSX.Element {
  const [comptes, setComptes] = useState<CompteFigma[] | null>(null)
  const [dossier, setDossier] = useState<string[]>([])
  const [nouveau, setNouveau] = useState('')
  const [relie, setRelie] = useState<string | null>(null)
  const [jeton, setJeton] = useState({ nom: '', valeur: '' })
  const [souci, setSouci] = useState<string | null>(null)

  const charger = (): void => {
    void window.api.comptesFigma().then(setComptes)
    void window.api.serveursDossier(projet.id).then(setDossier)
  }
  useEffect(charger, [projet.id])
  // Une connexion Figma se fait dans une autre fenêtre : on relit en revenant.
  useEffect(() => {
    addEventListener('focus', charger)
    return () => removeEventListener('focus', charger)
  })

  const figma = projet.figma ?? []
  const basculer = (s: string): void =>
    window.api.projetFigma(projet.id, figma.includes(s) ? figma.filter((x) => x !== s) : [...figma, s])

  const ajouterJeton = async (): Promise<void> => {
    if (!jeton.nom.trim() || !jeton.valeur.trim()) return
    const e = await window.api.jeton(projet.id, jeton.nom, jeton.valeur)
    setSouci(e)
    if (!e) setJeton({ nom: '', valeur: '' })
  }

  return (
    <div className="page">
      <section>
        <h4>Figma</h4>
        <p className="aide">Coche le compte de ce client : Claude ne verra que lui ici.</p>
        <div className="puces">
          {comptes === null && <span className="aide">…</span>}
          {comptes?.length === 0 && <span className="aide">Aucun compte Figma relié pour l’instant.</span>}
          {comptes?.map((c) => (
            <button
              key={c.serveur}
              type="button"
              className={`puce ${figma.includes(c.serveur) ? 'on' : ''} ${c.relie ? '' : 'perime'}`}
              onClick={() => basculer(c.serveur)}
              title={c.relie ? undefined : 'Connexion expirée : relie-le à nouveau'}
            >
              {libelle(c.serveur)}
            </button>
          ))}
        </div>
        <form className="ligne" onSubmit={(e) => {
          e.preventDefault()
          void window.api.relierFigma(nouveau).then((s) => { setRelie(s); setNouveau('') })
        }}>
          <input placeholder="Relier un compte (nom du client)" value={nouveau} onChange={(e) => setNouveau(e.target.value)} />
          <button type="submit" className="btn" disabled={!nouveau.trim()}>Relier</button>
        </form>
        {relie && <p className="aide">Une fenêtre s’ouvre pour <b>{relie}</b>. Vérifie d’abord que figma.com est connecté au bon compte dans ton navigateur.</p>}
      </section>

      <section>
        <h4>Jetons</h4>
        {(projet.jetons ?? []).map((n) => (
          <div key={n} className="ligne jeton">
            <code>{n}</code>
            <span className="aide">chiffré</span>
            <button type="button" className="lien" onClick={() => void window.api.jeton(projet.id, n, null)}>Retirer</button>
          </div>
        ))}
        <form className="ligne" onSubmit={(e) => { e.preventDefault(); void ajouterJeton() }}>
          <input placeholder="NOM_DU_JETON" value={jeton.nom} onChange={(e) => setJeton({ ...jeton, nom: e.target.value })} spellCheck={false} />
          <input type="password" placeholder="Valeur" value={jeton.valeur} onChange={(e) => setJeton({ ...jeton, valeur: e.target.value })} autoComplete="off" />
          <button type="submit" className="btn" disabled={!jeton.nom.trim() || !jeton.valeur.trim()}>Ajouter</button>
        </form>
        <p className="aide">Donnés à Claude Code en variables d’environnement : un <code>.mcp.json</code> peut écrire <code>{'${NOM_DU_JETON}'}</code>.</p>
        {souci && <p className="erreur">{souci}</p>}
      </section>

      <section>
        <h4>Serveurs</h4>
        {!projet.serveurs?.length && !dossier.length && <p className="aide">Leur état s’affiche après le premier message.</p>}
        {(projet.serveurs ?? []).map((s) => (
          <div key={s.nom} className="ligne serveur">
            <i className={`point ${s.etat}`} />
            <span>{s.nom}</span>
            <small>{ETATS[s.etat] ?? s.etat}</small>
          </div>
        ))}
        {dossier.filter((d) => !projet.serveurs?.some((s) => s.nom === d)).map((d) => (
          <div key={d} className="ligne serveur">
            <i className="point" />
            <span>{d}</span>
            <small>dans .mcp.json</small>
          </div>
        ))}
      </section>
    </div>
  )
}
