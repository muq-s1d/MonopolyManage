import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { isErr } from './engine/engine.ts'
import { run } from './engine/actions.ts'
import { prefs, sessions, store, useSnap, type Snap } from './store.ts'
import type { Live } from './net/live.ts'
import type { Reply } from './net/client.ts'
import { joinLink, UICtx, type Screen, type SheetSpec, type UI } from './ui/ctx.ts'
import Lobby from './ui/Lobby.tsx'
import Setup from './ui/Setup.tsx'
import Table from './ui/Table.tsx'
import Ledger from './ui/Ledger.tsx'
import EndGame from './ui/EndGame.tsx'
import Sheets from './ui/Sheets.tsx'
import { sfx, soundFor } from './ui/sound.ts'
import { ReleaseNotes } from './ui/WhatsNew.tsx'
import { CURRENT } from './releases.ts'

const BoardEditor = lazy(() => import('./editor/BoardEditor.tsx'))
const Join = lazy(() => import('./ui/Join.tsx'))

const noSub = () => () => {}

type Toast = { text: string; error?: boolean; action?: { label: string; run: () => void } }

// A manual popover lives in the top layer, so the toast shows above an open sheet's backdrop.
function ToastView({ toast }: { toast: Toast }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el?.showPopover) return
    if (el.matches(':popover-open')) el.hidePopover()
    el.showPopover()
  }, [toast])
  return (
    <div ref={ref} popover="manual" className="toast" role={toast.error ? 'alert' : 'status'} aria-live="polite">
      <span className={toast.error ? 'danger' : ''}>{toast.text}</span>
      {toast.action && <button className="ghost" onClick={toast.action.run}>{toast.action.label}</button>}
    </div>
  )
}

export default function App() {
  const snap = useSnap()
  const [screen, setScreen] = useState<Screen>(() => (joinLink() ? 'join' : store.get() && !sessions.host() ? 'table' : 'lobby')) // a session game reopens from the lobby's Resume session
  const [live, setLive] = useState<Live | null>(null)
  const phone = live?.kind === 'phone' ? live.client : null
  const view = useSyncExternalStore(phone?.subscribe ?? noSub, () => phone?.get() ?? null)
  // a phone shows the host's ledger, never the game saved on this device
  const shown: Snap = useMemo(() => (phone ? (view?.game && view.state ? { game: view.game, entries: view.entries, state: view.state } : null) : snap), [phone, view, snap])
  const [sheet, setSheet] = useState<SheetSpec | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  // release notes pop up on a first visit, and on the first visit after each new release
  const [notes, setNotes] = useState<'new' | 'all' | null>(() => (prefs.get().seenRelease === CURRENT.version ? null : 'new'))
  const closeNotes = useCallback(() => { prefs.set({ seenRelease: CURRENT.version }); setNotes(null) }, [])
  const timer = useRef(0)

  const show = useCallback((t: Toast, ms: number) => {
    clearTimeout(timer.current)
    setToast(t)
    timer.current = window.setTimeout(() => setToast(null), ms)
  }, [])

  // a phone's verdict comes back from the host; the entry itself arrives by sync
  const answer = useCallback((r: Reply) => {
    if (r.error) {
      sfx('error')
      const who = r.who
      show({ text: r.error, error: true, action: who ? { label: 'Raise money', run: () => setSheet({ kind: 'portfolio', player: who }) } : undefined }, 7000)
      return false
    }
    if (r.pending) show({ text: 'Sent for approval. It happens once everyone involved and the host say yes.' }, 5000)
    else {
      const last = phone?.get().entries.at(-1)
      if (last) { sfx(soundFor(last)); show({ text: last.memo }, 5000) }
    }
    return true
  }, [phone, show])

  const ui = useMemo<UI>(() => ({
    go: s => { setSheet(null); setScreen(s) },
    open: setSheet,
    close: () => setSheet(null),
    say: text => show({ text }, 4000),
    notes: () => { setSheet(null); setNotes('all') },
    live,
    setLive,
    me: phone ? view?.pid ?? null : null,
    undo: async () => {
      if (phone) return void answer(await phone.undo())
      if (!store.get()?.entries.length) return
      store.undo()
      sfx('undo')
      show({ text: 'Undid the last entry' }, 4000)
    },
    act: async (name, ...args) => {
      if (phone) return answer(await phone.act(name, ...args))
      const s = store.get()
      if (!s) return false
      const x = run(s.game, s.state, name, ...args)
      if (isErr(x)) {
        sfx('error')
        const who = x.who
        show({ text: x.error, error: true, action: who ? { label: 'Raise money', run: () => setSheet({ kind: 'portfolio', player: who }) } : undefined }, 7000)
        return false
      }
      store.commit(x)
      sfx(soundFor(x))
      show({ text: x.memo, action: { label: 'Undo', run: () => { store.undo(); sfx('undo'); setToast(null) } } }, 5000)
      return true
    },
  }), [show, live, phone, answer, view?.pid])

  // A game that vanished (cleared or rewound past the start) sends you back to the lobby.
  const current = phone ? 'join' : snap ? screen : screen === 'editor' || screen === 'setup' || screen === 'join' ? screen : 'lobby'

  useEffect(() => {
    if (!shown || (current !== 'table' && current !== 'join')) return
    let lock: WakeLockSentinel | null = null
    const grab = () => navigator.wakeLock?.request('screen').then(l => { lock = l }).catch(() => {})
    grab()
    const vis = () => document.visibilityState === 'visible' && grab()
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release() }
  }, [shown, current])

  return (
    <UICtx.Provider value={ui}>
      {current === 'lobby' && <Lobby />}
      {current === 'setup' && <Setup />}
      {current === 'table' && snap && <Table snap={snap} />}
      {current === 'ledger' && snap && <Ledger snap={snap} />}
      {current === 'end' && snap && <EndGame snap={snap} />}
      {current === 'editor' && <Suspense fallback={<p className="loading">Opening the drafting room</p>}><BoardEditor /></Suspense>}
      {current === 'join' && <Suspense fallback={<p className="loading">Opening the door</p>}><Join /></Suspense>}
      {sheet && shown && <Sheets spec={sheet} snap={shown} />}
      {notes && !sheet && current !== 'join' && <ReleaseNotes all={notes === 'all'} onClose={closeNotes} />}
      {toast && <ToastView toast={toast} />}
    </UICtx.Provider>
  )
}
