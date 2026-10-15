import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import './motion.css'
import { App } from '@/mobile/App'
import { trackSystemBars } from '@/mobile/bars'

trackSystemBars()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
