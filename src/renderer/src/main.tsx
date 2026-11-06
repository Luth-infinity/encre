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
import { creerPoulpe } from './poulpe'

/** L'icône de l'app (`ENCRE_ICONE`) : le poulpe de la bulle, en 512 px. */
function Icone(): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const p = creerPoulpe(canvas.current!, { distance: 7.8, fov: 30, hauteurCamera: 0.5, vise: 0.2 })
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
