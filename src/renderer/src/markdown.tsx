import { useState, type ReactNode } from 'react'

/**
 * Le Markdown que Claude écrit dans un chat : titres, paragraphes, listes
 * (imbriquées, cases à cocher), citations, séparateurs, tableaux, blocs de
 * code, images, gras, italique, barré, code, liens. Tout passe par React,
 * aucun HTML n'est injecté. Les réponses s'affichaient « brutes » (10/11) :
 * cases, citations et images restaient en texte.
 */

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)(\?[^\s]*)?$/i

/** Un chemin local (souvent une capture faite par Claude) devient une adresse `file://`. */
function source(s: string): string | null {
  s = s.trim().replace(/^<|>$/g, '')
  if (/^[A-Za-z]:[\\/]/.test(s)) return 'file:///' + s.replace(/\\/g, '/')
  if (s.startsWith('/') && !s.startsWith('//')) return 'file://' + s
  if (/^(https?:|file:|data:image\/)/.test(s)) return s
  return null
}

/** Une image qui ne charge pas redevient un lien : on ne laisse pas un cadre vide. */
function Image({ src, alt }: { src: string; alt: string }): JSX.Element {
  const [ko, setKo] = useState(false)
  if (ko) return <a href={src} target="_blank" rel="noreferrer">{alt || 'Image'}</a>
  return (
    <a className="md-image" href={src} target="_blank" rel="noreferrer" title={alt || undefined}>
      <img src={src} alt={alt} loading="lazy" onError={() => setKo(true)} />
    </a>
  )
}

function Code({ code, langue }: { code: string; langue: string }): JSX.Element {
  const [copie, setCopie] = useState(false)
  const copier = (): void => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopie(true)
      setTimeout(() => setCopie(false), 1400)
    })
  }
  return (
    <div className="md-code">
      <div className="md-code-tete">
        <span>{langue || 'code'}</span>
        <button type="button" onClick={copier}>{copie ? 'Copié' : 'Copier'}</button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  )
}

const MOTIF = /(`[^`]+`|!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\s][^*]*\*|\[[^\]]+\]\(https?:[^)]+\)|https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?»"'])/g

function enLigne(texte: string, cle: string): ReactNode[] {
  const out: ReactNode[] = []
  let dernier = 0, i = 0
  for (const m of texte.matchAll(MOTIF)) {
    if (m.index! > dernier) out.push(texte.slice(dernier, m.index))
    const t = m[0], k = `${cle}-${i++}`
    if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>)
    else if (t.startsWith('![')) {
      const l = /!\[([^\]]*)\]\(([^)\s]+)/.exec(t)!
      const src = source(l[2])
      out.push(src ? <Image key={k} src={src} alt={l[1]} /> : l[1])
    } else if (t.startsWith('**') || t.startsWith('__')) out.push(<strong key={k}>{enLigne(t.slice(2, -2), k)}</strong>)
    else if (t.startsWith('~~')) out.push(<del key={k}>{enLigne(t.slice(2, -2), k)}</del>)
    else if (t.startsWith('[')) {
      const l = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!
      out.push(<a key={k} href={l[2]} target="_blank" rel="noreferrer">{enLigne(l[1], k)}</a>)
    } else if (t.startsWith('http')) {
      // Une adresse d'image seule s'affiche en image ; les autres, sans
      // « https:// » ni barre finale : plus courtes à lire, même lien.
      if (IMAGE.test(t)) out.push(<Image key={k} src={t} alt="" />)
      else out.push(<a key={k} href={t} target="_blank" rel="noreferrer">{t.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>)
    } else out.push(<em key={k}>{enLigne(t.slice(1, -1), k)}</em>)
    dernier = m.index! + t.length
  }
  if (dernier < texte.length) out.push(texte.slice(dernier))
  return out
}

const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const retrait = (l: string): number => (/^\s*/.exec(l)![0].replace(/\t/g, '  ')).length
const SEPARATEUR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const TABLEAU = (l: string, s?: string): boolean =>
  /^\s*\|.*\|\s*$/.test(l) && /^\s*\|?[\s:|-]+\|?\s*$/.test(s ?? '') && (s ?? '').includes('-')

/** Une liste et ses sous-listes : un item prend les lignes plus en retrait qui le suivent. */
function liste(lignes: string[], cle: string): ReactNode {
  const base = retrait(lignes[0])
  const items: { texte: string; enfants: string[] }[] = []
  for (const l of lignes) {
    const m = ITEM.exec(l)
    if (m && retrait(l) <= base + 1) items.push({ texte: m[3], enfants: [] })
    else items[items.length - 1]?.enfants.push(l)
  }
  const ordonnee = /\d/.test(ITEM.exec(lignes[0])![2])
  const depart = ordonnee ? parseInt(ITEM.exec(lignes[0])![2], 10) : 1
  const taches = items.every((it) => /^\[[ xX]\]\s/.test(it.texte))
  const lis = items.map((it, j) => {
    const tache = /^\[([ xX])\]\s+(.*)$/.exec(it.texte)
    const fait = tache && tache[1] !== ' '
    // Les lignes en retrait qui ne sont pas des items prolongent le texte de l'item.
    const suite = it.enfants.filter((l) => l.trim())
    const sous = suite.findIndex((l) => ITEM.test(l))
    const texte = [tache ? tache[2] : it.texte, ...(sous < 0 ? suite : suite.slice(0, sous)).map((l) => l.trim())].join(' ')
    return (
      <li key={j} className={tache ? `tache${fait ? ' faite' : ''}` : undefined}>
        {tache && <span className="case" aria-label={fait ? 'Fait' : 'À faire'}>{fait ? '✓' : ''}</span>}
        <span>{enLigne(texte, `${cle}-${j}`)}</span>
        {sous >= 0 && liste(suite.slice(sous), `${cle}-${j}s`)}
      </li>
    )
  })
  const classe = taches ? 'taches' : undefined
  return ordonnee
    ? <ol key={cle} className={classe} start={depart !== 1 ? depart : undefined}>{lis}</ol>
    : <ul key={cle} className={classe}>{lis}</ul>
}

function blocs(lignes: string[], cle: string): ReactNode[] {
  const out: ReactNode[] = []
  let i = 0, n = 0
  const k = (): string => `${cle}${n++}`
  while (i < lignes.length) {
    const l = lignes[i]
    const clot = /^\s*(```+|~~~+)\s*([\w+#.-]*)/.exec(l)
    if (clot) {
      const code: string[] = []
      i++
      while (i < lignes.length && !lignes[i].trim().startsWith(clot[1])) code.push(lignes[i++])
      i++
      out.push(<Code key={k()} code={code.join('\n')} langue={clot[2]} />)
      continue
    }
    if (!l.trim()) { i++; continue }
    if (SEPARATEUR.test(l)) { out.push(<hr key={k()} />); i++; continue }
    const titre = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l)
    if (titre) {
      const niveau = Math.min(titre[1].length, 3)
      const contenu = enLigne(titre[2], k())
      out.push(niveau === 1 ? <h3 key={k()}>{contenu}</h3> : niveau === 2 ? <h4 key={k()}>{contenu}</h4> : <h5 key={k()}>{contenu}</h5>)
      i++
      continue
    }
    if (/^\s*>/.test(l)) {
      const cites: string[] = []
      while (i < lignes.length && /^\s*>/.test(lignes[i])) cites.push(lignes[i++].replace(/^\s*>\s?/, ''))
      out.push(<blockquote key={k()}>{blocs(cites, k())}</blockquote>)
      continue
    }
    if (ITEM.test(l)) {
      const items: string[] = []
      while (i < lignes.length) {
        const x = lignes[i]
        if (ITEM.test(x) || (x.trim() && retrait(x) >= 2 && items.length)) { items.push(x); i++; continue }
        // Une ligne vide entre deux items ne coupe pas la liste.
        if (!x.trim() && ITEM.test(lignes[i + 1] ?? '')) { i++; continue }
        break
      }
      out.push(liste(items, k()))
      continue
    }
    if (TABLEAU(l, lignes[i + 1])) {
      const cellules = (x: string): string[] => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const tete = cellules(l)
      const alignes = cellules(lignes[i + 1]).map((c) => (c.endsWith(':') ? (c.startsWith(':') ? 'center' : 'right') : undefined))
      const rangs: string[][] = []
      i += 2
      while (i < lignes.length && /^\s*\|.*\|\s*$/.test(lignes[i])) rangs.push(cellules(lignes[i++]))
      const c = k()
      out.push(
        <div key={c} className="tableau">
          <table>
            <thead><tr>{tete.map((x, j) => <th key={j} style={{ textAlign: alignes[j] }}>{enLigne(x, `${c}h${j}`)}</th>)}</tr></thead>
            <tbody>{rangs.map((r, y) => <tr key={y}>{r.map((x, j) => <td key={j} style={{ textAlign: alignes[j] }}>{enLigne(x, `${c}${y}-${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
      continue
    }
    // La première ligne entre toujours : une ligne en « | » qui n'est pas un tableau ne doit pas bloquer la boucle.
    const para: string[] = [lignes[i++]]
    while (i < lignes.length && lignes[i].trim() && !/^(\s*(```|~~~)|#{1,6}\s|\s*>|\s*([-*+]|\d+[.)])\s|\s*\|)/.test(lignes[i]) && !SEPARATEUR.test(lignes[i])) para.push(lignes[i++])
    const texte = para.join(' ')
    const c = k()
    // Un paragraphe fait seulement d'images devient une galerie.
    const seul = texte.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/https?:\/\/\S+\.(png|jpe?g|gif|webp|avif|svg)(\?\S*)?/gi, '').trim() === ''
    out.push(seul ? <div key={c} className="md-galerie">{enLigne(texte, c)}</div> : <p key={c}>{enLigne(texte, c)}</p>)
  }
  return out
}

export function Markdown({ texte }: { texte: string }): JSX.Element {
  return <div className="md">{blocs(texte.replace(/\r/g, '').split('\n'), 'b')}</div>
}
