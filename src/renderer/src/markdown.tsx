import type { ReactNode } from 'react'

/**
 * Le Markdown que Claude écrit dans un chat : paragraphes, listes, titres,
 * blocs de code, gras, italique, code, liens. Tout passe par React, aucun
 * HTML n'est injecté. Réduit d'après celui de Calque.
 */

function enLigne(texte: string, cle: string): ReactNode[] {
  const out: ReactNode[] = []
  const motif = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\(https?:[^)]+\))/g
  let dernier = 0, i = 0
  for (const m of texte.matchAll(motif)) {
    if (m.index! > dernier) out.push(texte.slice(dernier, m.index))
    const t = m[0], k = `${cle}-${i++}`
    if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>)
    else if (t.startsWith('**')) out.push(<strong key={k}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('[')) {
      const l = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!
      out.push(<a key={k} href={l[2]} target="_blank" rel="noreferrer">{l[1]}</a>)
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>)
    dernier = m.index! + t.length
  }
  if (dernier < texte.length) out.push(texte.slice(dernier))
  return out
}

export function Markdown({ texte }: { texte: string }): JSX.Element {
  const lignes = texte.replace(/\r/g, '').split('\n')
  const blocs: ReactNode[] = []
  let i = 0, n = 0
  while (i < lignes.length) {
    const l = lignes[i]
    if (l.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lignes.length && !lignes[i].startsWith('```')) code.push(lignes[i++])
      i++
      blocs.push(<pre key={n++}><code>{code.join('\n')}</code></pre>)
      continue
    }
    const titre = /^(#{1,4})\s+(.*)$/.exec(l)
    if (titre) { blocs.push(<h4 key={n++}>{enLigne(titre[2], `t${n}`)}</h4>); i++; continue }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordonnee = /^\s*\d+\./.test(l)
      const items: ReactNode[] = []
      while (i < lignes.length && /^\s*([-*]|\d+\.)\s+/.test(lignes[i])) {
        items.push(<li key={i}>{enLigne(lignes[i].replace(/^\s*([-*]|\d+\.)\s+/, ''), `l${i}`)}</li>)
        i++
      }
      blocs.push(ordonnee ? <ol key={n++}>{items}</ol> : <ul key={n++}>{items}</ul>)
      continue
    }
    // Tableau : une ligne d'en-tête, puis |---|---|.
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?[\s:|-]+\|?\s*$/.test(lignes[i + 1] ?? '') && (lignes[i + 1] ?? '').includes('-')) {
      const cellules = (x: string): string[] => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const tete = cellules(l)
      const rangs: string[][] = []
      i += 2
      while (i < lignes.length && /^\s*\|.*\|\s*$/.test(lignes[i])) rangs.push(cellules(lignes[i++]))
      blocs.push(
        <div key={n++} className="tableau">
          <table>
            <thead><tr>{tete.map((c, j) => <th key={j}>{enLigne(c, `h${n}${j}`)}</th>)}</tr></thead>
            <tbody>{rangs.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{enLigne(c, `c${n}${k}${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
      continue
    }
    if (!l.trim()) { i++; continue }
    // La première ligne entre toujours : une ligne en « | » qui n'est pas un tableau ne doit pas bloquer la boucle.
    const para: string[] = [lignes[i++]]
    while (i < lignes.length && lignes[i].trim() && !/^(```|#{1,4}\s|\s*([-*]|\d+\.)\s|\s*\|)/.test(lignes[i])) para.push(lignes[i++])
    blocs.push(<p key={n++}>{enLigne(para.join(' '), `p${n}`)}</p>)
  }
  return <div className="md">{blocs}</div>
}
