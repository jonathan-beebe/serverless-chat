import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// IMPRV-022: SW registration now lives in `<UpdatePrompt>` via
// `useRegisterSW({ immediate: true })`. That single React-side entry handles
// both registration and the user-facing "new version available" banner that
// `registerType: 'prompt'` was already configured for.
