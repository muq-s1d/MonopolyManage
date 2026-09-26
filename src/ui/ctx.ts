import { createContext, useContext } from 'react'
import type { ActionArgs, ActionName } from '../engine/actions.ts'
import type { RentOpts } from '../engine/engine.ts'
import type { Live } from '../net/live.ts'

export type DealTab = 'trade' | 'pact' | 'loan' | 'pass'

export type Screen = 'lobby' | 'setup' | 'table' | 'ledger' | 'editor' | 'end' | 'join'

export type SheetSpec =
  | { kind: 'landed' }
  | { kind: 'cell'; cell: number; landed?: boolean; opts?: RentOpts }
  | { kind: 'card'; deck: 'chance' | 'chest' }
  | { kind: 'nearest'; type: 'railroad' | 'utility' }
  | { kind: 'portfolio'; player: string }
  | { kind: 'deals'; tab?: DealTab }
  | { kind: 'payment' }
  | { kind: 'bankrupt'; player: string; creditor?: string }
  | { kind: 'menu' }

export type UI = {
  go: (s: Screen) => void
  open: (s: SheetSpec) => void
  close: () => void
  /** Run a ledger action by name and commit it, or show why it cannot happen. Resolves true when committed. */
  act: <K extends ActionName>(name: K, ...args: ActionArgs<K>) => Promise<boolean>
  say: (text: string) => void
  /** Remove the newest ledger entry, with its sound and a note. */
  undo: () => void
  /** Open the release notes for every version. */
  notes: () => void
  /** The session this device hosts or has joined, if any. Loaded lazily, so admin mode never downloads it. */
  live: Live | null
  setLive: (l: Live | null) => void
}

/** `#join=KQZMT`, from the QR code on the host screen. The host's own phone also carries `&host=<secret>`. */
export const joinLink = () => {
  const m = /^#join=([A-Za-z]{5})(?:&host=([\w-]+))?/.exec(location.hash)
  return m ? { code: m[1].toUpperCase(), host: m[2] } : null
}

export const UICtx = createContext<UI>(null!)
export const useUI = () => useContext(UICtx)
