import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presets } from '../engine/boards.ts'
import * as E from '../engine/engine.ts'
import * as D from '../engine/deals.ts'
import type { Entry, Err, Game, State } from '../engine/types.ts'
import { hz, soundFor } from './sound.ts'

test('note names map to the right pitch', () => {
  assert.equal(hz('A4'), 440)
  assert.ok(Math.abs(hz('C5') - 523.25) < 0.01)
  assert.ok(Math.abs(hz('F#4') - 369.99) < 0.01)
  assert.ok(Math.abs(hz('Bb3') - 233.08) < 0.01)
})

test('every kind of ledger entry gets the intended sound', () => {
  const US = presets[0]
  const g: Game = {
    id: 'g', createdAt: 0, board: US, rules: E.defaultRules,
    players: ['a', 'b', 'c'].map((id, i) => ({ id, name: id, color: '#fff', accessory: i, seed: i })),
  }
  let s: State = E.initialState(g)
  const log: Entry[] = []
  const run = (x: Entry | Err) => { if (E.isErr(x)) throw new Error(x.error); log.push(x); s = E.replay(g, log); return x }
  const chest = (type: string) => US.chest.find(c => c.effect.type === type)!
  const chance = (type: string) => US.chance.find(c => c.effect.type === type)!

  const cases: [string, Entry, string][] = [
    ['buy', run(E.buy(g, s, 'a', 1)), 'buy'],
    ['buy the set', run(E.buy(g, s, 'a', 3)), 'buy'],
    ['rent', run(E.payRent(g, s, 'b', 1)), 'rent'],
    ['house', run(E.build(g, s, 1)), 'house'],
    ['sell', run(E.sell(g, s, 1)), 'sell'],
    ['tax', run(E.payTax(g, s, 'b', 4)), 'pay'],
    ['pot', run(E.collectPot(g, s, 'c')), 'jackpot'],
    ['pass go', run(E.passGo(g, 'c')), 'bigCoin'],
    ['small card', run(E.drawCard(g, s, 'c', US.chest.find(c => c.effect.type === 'collect' && c.effect.amount < 200)!)), 'coin'],
    ['bank error, 200', run(E.drawCard(g, s, 'c', chest('collect'))), 'bigCoin'],
    ['birthday', run(E.drawCard(g, s, 'c', chest('collectEach'))), 'rent'],
    ['jail card', run(E.drawCard(g, s, 'c', chance('jailCard'))), 'card'],
    ['go to jail', run(E.goToJail(g, 'c')), 'jail'],
    ['use jail card', run(E.leaveJail(g, s, 'c', 'card')), 'free'],
    ['mortgage', run(E.mortgage(g, s, 3)), 'mortgage'],
    ['lift', run(E.unmortgage(g, s, 3)), 'unmortgage'],
    ['trade', run(E.trade(g, s, 'a', 'b', { cells: [3], cash: 0, jailCards: 0 }, { cells: [], cash: 100, jailCards: 0 })), 'trade'],
    ['next turn', run(E.endTurn(g, s)), 'turn'],
    ['bankrupt', run(E.bankrupt(g, s, 'b', 'a')), 'bankrupt'],
  ]
  for (const [label, entry, want] of cases) assert.equal(soundFor(entry), want, label)

  // b's bankruptcy handed the brown set back to a, so a can build up to a hotel
  for (let k = 0; k < 4; k++) { run(E.build(g, s, 1)); run(E.build(g, s, 3)) }
  assert.equal(soundFor(run(E.build(g, s, 1))), 'hotel')
})

test('deal entries get their own sounds', () => {
  const g: Game = {
    id: 'g', createdAt: 0, board: presets[0], rules: E.defaultRules,
    players: ['a', 'b', 'c'].map((id, i) => ({ id, name: id, color: '#fff', accessory: i, seed: i })),
  }
  let s: State = E.initialState(g)
  const log: Entry[] = []
  const run = (x: Entry | Err) => { if (E.isErr(x)) throw new Error(x.error); log.push(x); s = E.replay(g, log); return x }
  run(E.buy(g, s, 'a', 16)); run(E.buy(g, s, 'b', 18)); run(E.buy(g, s, 'b', 39))
  assert.equal(soundFor(run(D.formPact(g, s, { members: ['a', 'b'], shares: { a: 50, b: 50 }, groups: ['orange'], allyRent: 'free' }))), 'pact')
  assert.equal(soundFor(run(D.endPact(g, s, Object.keys(s.pacts)[0]))), 'sell')
  const loan = run(D.lend(g, s, { lender: 'a', borrower: 'c', amount: 200, ratePct: 10, rounds: 2 }))
  assert.equal(soundFor(loan), 'bigCoin')
  assert.equal(soundFor(run(D.repayLoan(g, s, Object.keys(s.loans)[0]))), 'coin')
  assert.equal(soundFor(run(D.grantPass(g, s, { holder: 'a', grantor: 'b', group: 'all', landings: 1, price: 20 }))), 'trade')
  assert.equal(soundFor(run(D.usePass(g, s, Object.keys(s.immunities)[0], 39))), 'free')
})
