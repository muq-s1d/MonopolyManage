import { createContext, useContext } from 'react'
import type { Entry, Err } from '../engine/types.ts'
import type { RentOpts } from '../engine/engine.ts'

export type DealTab = 'trade' | 'pact' | 'loan' | 'pass'

export type Screen = 'lobby' | 'setup' | 'table' | 'ledger' | 'editor' | 'end'

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
  /** Commit an engine result, or show why it cannot happen. Returns true when committed. */
  act: (x: Entry | Err) => boolean
  say: (text: string) => void
  /** Remove the newest ledger entry, with its sound and a note. */
  undo: () => void
}

export const UICtx = createContext<UI>(null!)
export const useUI = () => useContext(UICtx)
