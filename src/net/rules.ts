import { ACTIONS, type ActionName } from '../engine/actions.ts'
import { pactFor } from '../engine/engine.ts'
import { passFor, type LoanDraft, type PactDraft, type PassDraft } from '../engine/deals.ts'
import type { Card, Game, Party, State } from '../engine/types.ts'

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
    case 'buy': {
      const [pid, cell, price] = args as [string, number, number?]
      if (price !== undefined && price !== g.board.cells[cell]?.price) return { error: 'Auction wins are recorded on the host screen' }
      return mine(pid)
    }
    case 'payRent': {
      const [pid, , opts] = args as [string, number, { railroadMultiplier?: number }?]
      if (![undefined, 1, 2].includes(opts?.railroadMultiplier)) return { error: 'Unknown rent multiplier' }
      return mine(pid)
    }
    case 'usePass': {
      const [id, cell] = args as [string, number]
      return passFor(g, s, me, cell)?.id === id ? mine(me) : { error: 'That pass does not cover this deed' }
    }
    case 'payTax': case 'passGo': case 'collectPot': case 'leaveJail': return mine(a[0])
    case 'goToJail': {
      const [pid, why] = args as [string, string?]
      return why === undefined || why === 'rolled doubles three times and went to jail' ? mine(pid) : { error: 'Unknown reason' }
    }
    case 'drawCard': {
      const [pid, card] = args as [string, Card]
      const real = [...g.board.chance, ...g.board.chest].some(c => JSON.stringify(c) === JSON.stringify(card))
      return real ? mine(pid) : { error: 'That card is not in the decks' }
    }
    case 'endTurn': return mine(me)
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
