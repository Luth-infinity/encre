import React, { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter-tight/400.css'
import '@fontsource/inter-tight/500.css'
import '@fontsource/inter-tight/600.css'
import '@fontsource/inter-tight/700.css'
import '@fontsource/jetbrains-mono/400.css'
import './styles.css'
import Bulle from './Bulle'
import Panneau from './Panneau'
import { avatarDe } from '@shared/types'
import { creerPoulpe } from './poulpe'

/** L'icône de l'app (`ENCRE_ICONE`) : le poulpe de la bulle, en 512 px. `?avatar=` dessine un autre avatar. */
function Icone(): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const a = avatarDe(new URLSearchParams(location.search).get('avatar') ?? undefined)
    const p = creerPoulpe(canvas.current!, { remplir: 0.82, espece: a.espece, peau: a.peau, motif: a.motif })
    return () => p.detruire()
  }, [])
  return <div className="icone-app"><canvas ref={canvas} /></div>
}

// Une seule page, trois usages : `?vue=bulle`, `?vue=panneau`, `?vue=icone`.
const vue = new URLSearchParams(location.search).get('vue')
document.documentElement.dataset.vue = vue ?? 'panneau'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{vue === 'bulle' ? <Bulle /> : vue === 'icone' ? <Icone /> : <Panneau />}</React.StrictMode>
)
