import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import './motion.css'
import { App } from '@/mobile/App'
import { trackSystemBars } from '@/mobile/bars'
import { PixelIconMotion } from '@/ui/pixel-icons-motion'

trackSystemBars()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PixelIconMotion />
    <App />
  </StrictMode>,
)
