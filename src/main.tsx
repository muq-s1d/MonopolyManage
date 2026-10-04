import { createRoot } from 'react-dom/client'
import './ui/styles.css'
import './ui/screens.css'
import App from './App.tsx'
import { prefs } from './store.ts'

// the Android app opens the site with ?apk=<its version>, which the lobby compares with the newest
const apk = Number(new URLSearchParams(location.search).get('apk'))
if (apk) prefs.set({ apk })

createRoot(document.getElementById('root')!).render(<App />)
