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
    if (!l.trim()) { i++; continue }
    const para: string[] = []
    while (i < lignes.length && lignes[i].trim() && !/^(```|#{1,4}\s|\s*([-*]|\d+\.)\s)/.test(lignes[i])) para.push(lignes[i++])
    blocs.push(<p key={n++}>{enLigne(para.join(' '), `p${n}`)}</p>)
  }
  return <div className="md">{blocs}</div>
}
