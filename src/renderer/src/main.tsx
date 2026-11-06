import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter-tight/400.css'
import '@fontsource/inter-tight/500.css'
import '@fontsource/inter-tight/600.css'
import '@fontsource/inter-tight/700.css'
import '@fontsource/jetbrains-mono/400.css'
import './styles.css'
import Bulle from './Bulle'
import Panneau from './Panneau'

// Une seule page, deux fenêtres : `?vue=bulle` ou `?vue=panneau`.
const vue = new URLSearchParams(location.search).get('vue')
document.documentElement.dataset.vue = vue ?? 'panneau'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{vue === 'bulle' ? <Bulle /> : <Panneau />}</React.StrictMode>
)
