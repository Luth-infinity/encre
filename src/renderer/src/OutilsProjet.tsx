import { useEffect, useState } from 'react'
import type { CompteFigma, OutilConnu, OutilMachine, Projet } from '@shared/types'

/** Le serveur Figma officiel n'a pas de nom de compte : on l'appelle simplement « par défaut ». */
const LIBELLES: Record<string, string> = { 'figma-remote-mcp': 'par défaut' }
const libelle = (serveur: string): string => LIBELLES[serveur] ?? serveur.replace(/^figma-/, '')

const PORTEES: Record<OutilMachine['portee'], string> = { tous: 'tous les projets', dossier: 'ce dossier', projet: '.mcp.json' }

/**
 * Les outils du projet ouvert. En tête, ceux de Claude Code (Notion, Linear…)
 * avec leur état et un bouton pour les connecter : avant, un outil pas
 * connecté finissait en « ouvre un terminal » (12/11). Puis les comptes
 * Figma (un client, un compte) et les jetons.
 */
export default function OutilsProjet({ projet }: { projet: Projet }): JSX.Element {
  const [machine, setMachine] = useState<OutilMachine[] | null>(null)
  const [catalogue, setCatalogue] = useState<OutilConnu[]>([])
  const [comptes, setComptes] = useState<CompteFigma[] | null>(null)
  const [nouveau, setNouveau] = useState('')
  const [relie, setRelie] = useState<string | null>(null)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [autre, setAutre] = useState<{ nom: string; url: string } | null>(null)
  const [jeton, setJeton] = useState({ nom: '', valeur: '' })
  const [souci, setSouci] = useState<string | null>(null)

  const charger = (): void => {
    void window.api.outilsMachine(projet.id).then(setMachine)
    void window.api.comptesFigma().then(setComptes)
  }
  useEffect(charger, [projet.id])
  useEffect(() => void window.api.catalogueOutils().then(setCatalogue), [])
  // Une connexion se fait dans une autre fenêtre : on relit en revenant.
  useEffect(() => {
    addEventListener('focus', charger)
    return () => removeEventListener('focus', charger)
  })

  const connecter = (nom: string, url?: string): void => {
    void window.api.connecterOutil(projet.id, nom, url).then((s) => {
      setOuvert(s ?? `!${nom}`)
      if (s) setAutre(null)
    })
  }

  const figma = projet.figma ?? []
  const basculer = (s: string): void =>
    window.api.projetFigma(projet.id, figma.includes(s) ? figma.filter((x) => x !== s) : [...figma, s])

  const ajouterJeton = async (): Promise<void> => {
    if (!jeton.nom.trim() || !jeton.valeur.trim()) return
    const e = await window.api.jeton(projet.id, jeton.nom, jeton.valeur)
    setSouci(e)
    if (!e) setJeton({ nom: '', valeur: '' })
  }

  /** L'état vu au dernier message l'emporte : un jeton présent peut quand même être refusé. */
  const etatTour = (nom: string): string | undefined => projet.serveurs?.find((s) => s.nom === nom)?.etat
  const aConnecter = (o: OutilMachine): boolean => (o.aConnecter && !o.connecte) || etatTour(o.nom) === 'needs-auth'
  const proposes = catalogue.filter((c) => !machine?.some((o) => o.nom === c.nom))
  const nomOuvert = ouvert && !ouvert.startsWith('!') ? catalogue.find((c) => c.nom === ouvert)?.titre ?? ouvert : null

  return (
    <div className="page">
      <section>
        <h4>Outils</h4>
        <p className="aide">Ce que Claude peut utiliser ici. Un outil à connecter s’ouvre dans ton navigateur : tu acceptes, et c’est prêt au message suivant.</p>
        {machine === null && <p className="aide">…</p>}
        {machine?.length === 0 && <p className="aide">Aucun outil pour l’instant : ajoutes-en un juste en dessous.</p>}
        {machine?.map((o) => {
          const manque = aConnecter(o)
          const panne = etatTour(o.nom) === 'failed'
          return (
            <div key={o.nom} className="ligne serveur">
              <i className={`point ${manque ? 'needs-auth' : panne ? 'failed' : 'connected'}`} />
              <span>{o.nom}</span>
              <small>{manque ? 'à connecter' : panne ? 'en panne' : PORTEES[o.portee]}</small>
              {o.distant && (manque || panne) && (
                <button type="button" className="btn petit" onClick={() => connecter(o.nom)}>Connecter</button>
              )}
            </div>
          )
        })}
        {nomOuvert && <p className="aide">Une fenêtre s’ouvre pour connecter <b>{nomOuvert}</b> : suis-la dans ton navigateur, puis reviens ici.</p>}
        {ouvert?.startsWith('!') && <p className="erreur">Impossible d’ouvrir la connexion : Claude Code est-il installé ?</p>}
      </section>

      <section>
        <h4>Ajouter un outil</h4>
        <div className="catalogue">
          {proposes.map((c) => (
            <button key={c.nom} type="button" className="outil-connu" onClick={() => connecter(c.nom)}>
              <strong>{c.titre}</strong>
              <small>{c.aide}</small>
            </button>
          ))}
          <button type="button" className="outil-connu autre" onClick={() => setAutre(autre ? null : { nom: '', url: '' })}>
            <strong>Autre</strong>
            <small>Une adresse de serveur MCP</small>
          </button>
        </div>
        {autre && (
          <form className="ligne" onSubmit={(e) => { e.preventDefault(); connecter(autre.nom, autre.url) }}>
            <input autoFocus placeholder="Nom (ex. hubspot)" value={autre.nom} onChange={(e) => setAutre({ ...autre, nom: e.target.value })} spellCheck={false} />
            <input placeholder="https://…/mcp" value={autre.url} onChange={(e) => setAutre({ ...autre, url: e.target.value })} spellCheck={false} />
            <button type="submit" className="btn" disabled={!autre.nom.trim() || !/^https:\/\//.test(autre.url.trim())}>Connecter</button>
          </form>
        )}
        <p className="aide">Ajouté pour tous tes projets. Tu peux aussi le demander à Tako : « connecte Notion ».</p>
      </section>

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
    </div>
  )
}
