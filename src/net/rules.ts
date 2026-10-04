import { ACTIONS, reach, type ActionName, type Landing } from '../engine/actions.ts'
import { pactFor } from '../engine/engine.ts'
import { type LoanDraft, type PactDraft, type PassDraft } from '../engine/deals.ts'
import type { Game, Party, State } from '../engine/types.ts'

/** What happens to a phone's request: run it now, collect the other side's yes then the host's, or ask the host. */
export type Gate = { gate: 'now' } | { gate: 'deal'; needs: string[] } | { gate: 'host' } | { error: string }

const NOW: Gate = { gate: 'now' }, HOST: Gate = { gate: 'host' }
const others = (me: string, ids: string[]) => [...new Set(ids)].filter(id => id !== me)
const deal = (me: string, ids: string[]): Gate => {
  const needs = others(me, ids)
  return ids.includes(me) && needs.length ? { gate: 'deal', needs } : { error: 'You can only make deals you are part of' }
}

/** The permission table: who may ask for which action from a phone. The host screen skips it. */
export function gate(g: Game, s: State, me: string, name: string, args: unknown[]): Gate {
  if (name === 'undo') return HOST
  if (!(name in ACTIONS)) return { error: 'Unknown action' }
  if (s.bankrupt[me]) return { error: 'You are out of the game' }
  const a = args as never[]
  const turn = s.turn === me
  const mine = (pid: unknown, gate = NOW): Gate =>
    pid !== me ? { error: 'That is another player’s move' } : turn ? gate : { error: 'Wait for your turn' }
  switch (name as ActionName) {
    case 'land': {
      const [pid, cell, how] = args as [string, number, Landing?]
      if (how?.do === 'rent' && ![undefined, 1, 2].includes(how.opts?.railroadMultiplier)) return { error: 'Unknown rent multiplier' }
      const g2 = mine(pid)
      if ('error' in g2) return g2
      if (s.moves <= 0) return { error: s.jailed[me] ? 'You are in jail' : 'That roll is already recorded. If it was the wrong square, ask the host to undo it.' }
      return cell in reach(g, s, me) ? NOW : { error: 'Your piece cannot get there from where it stands' }
    }
    case 'rollDoubles': return mine(a[0])
    case 'endTurn': {
      const g2 = mine(me)
      return 'error' in g2 || s.moves === 0 ? g2 : { error: 'Tap the square you landed on first' }
    }
    case 'buy': return { error: a[2] === undefined ? 'Tap the square you landed on to buy it' : 'Auctions run live: tap Auction it' }
    case 'payRent': case 'payTax': case 'drawCard': case 'collectPot': case 'usePass':
      return { error: 'Tap the square you landed on to record it' }
    case 'passGo': case 'goToJail': return mine(a[0], HOST) // passing Go is paid with the landing; anything else is a correction
    case 'leaveJail': return mine(a[0])
    case 'build': case 'sell': {
      const cell = a[0] as number
      return s.owner[cell] === me || pactFor(g, s, cell)?.members.includes(me) ? NOW : { error: 'Not your deed' }
    }
    case 'mortgage': case 'unmortgage': return s.owner[a[0] as number] === me ? NOW : { error: 'Not your deed' }
    case 'repayLoan': return s.loans[a[0]]?.borrower === me ? NOW : { error: 'Not your loan to repay' }
    case 'forgiveLoan': return s.loans[a[0]]?.lender === me ? NOW : { error: 'Not your loan to forgive' }
    case 'cancelPass': return s.immunities[a[0]]?.grantor === me ? NOW : { error: 'Not your pass to cancel' }
    case 'transfer': {
      const [from] = args as [Party]
      return from === me ? NOW : HOST // money coming to you from the bank, the pot or someone else needs the host
    }
    case 'trade': return deal(me, [a[0], a[1]])
    case 'formPact': {
      const [d, id] = args as [PactDraft, string?]
      return deal(me, [...(d?.members ?? []), ...(id ? s.pacts[id]?.members ?? [] : [])])
    }
    case 'endPact': return deal(me, s.pacts[a[0]]?.members ?? [])
    case 'lend': { const d = a[0] as LoanDraft; return deal(me, [d?.lender, d?.borrower]) }
    case 'grantPass': { const d = a[0] as PassDraft; return deal(me, [d?.holder, d?.grantor]) }
    case 'bankrupt': return a[0] === me ? HOST : { error: 'Only you can declare yourself bankrupt' }
  }
}

/** Whether this player may put a square up for auction: the unowned one they just landed on and left. */
export function auctionProblem(g: Game, s: State, me: string, cell: number): string | null {
  if (!g.rules.auctions) return 'Auctions are off in this game'
  if (s.turn !== me) return 'Only the player who landed there can auction it'
  const c = g.board.cells[cell]
  if (!c?.price || s.owner[cell]) return 'Only an unowned deed can be auctioned'
  if (s.pos[me] !== cell || s.moves > 0) return 'Auction the square you just landed on'
  return null
}
