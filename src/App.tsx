import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isErr } from './engine/engine.ts'
import type { Entry, Err } from './engine/types.ts'
import { prefs, store, useSnap } from './store.ts'
import { UICtx, type Screen, type SheetSpec, type UI } from './ui/ctx.ts'
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
  const [screen, setScreen] = useState<Screen>(() => (store.get() ? 'table' : 'lobby'))
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

  const ui = useMemo<UI>(() => ({
    go: s => { setSheet(null); setScreen(s) },
    open: setSheet,
    close: () => setSheet(null),
    say: text => show({ text }, 4000),
    notes: () => { setSheet(null); setNotes('all') },
    undo: () => {
      if (!store.get()?.entries.length) return
      store.undo()
      sfx('undo')
      show({ text: 'Undid the last entry' }, 4000)
    },
    act: (x: Entry | Err) => {
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
  }), [show])

  // A game that vanished (cleared or rewound past the start) sends you back to the lobby.
  const current = snap ? screen : screen === 'editor' || screen === 'setup' ? screen : 'lobby'

  useEffect(() => {
    if (!snap || current !== 'table') return
    let lock: WakeLockSentinel | null = null
    const grab = () => navigator.wakeLock?.request('screen').then(l => { lock = l }).catch(() => {})
    grab()
    const vis = () => document.visibilityState === 'visible' && grab()
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release() }
  }, [snap, current])

  return (
    <UICtx.Provider value={ui}>
      {current === 'lobby' && <Lobby />}
      {current === 'setup' && <Setup />}
      {current === 'table' && snap && <Table snap={snap} />}
      {current === 'ledger' && snap && <Ledger snap={snap} />}
      {current === 'end' && snap && <EndGame snap={snap} />}
      {current === 'editor' && <Suspense fallback={<p className="loading">Opening the drafting room</p>}><BoardEditor /></Suspense>}
      {sheet && snap && <Sheets spec={sheet} snap={snap} />}
      {notes && !sheet && <ReleaseNotes all={notes === 'all'} onClose={closeNotes} />}
      {toast && <ToastView toast={toast} />}
    </UICtx.Provider>
  )
}
