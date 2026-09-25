import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presets } from './boards.ts'
import * as E from './engine.ts'
import type { Entry, Err, Game, Rules, State } from './types.ts'

const US = presets[0]
const idx = (name: string) => US.cells.findIndex(c => c.name === name)

function setup(rules: Partial<Rules> = {}) {
  const g: Game = {
    id: 'g', createdAt: 0, board: US, rules: { ...E.defaultRules, ...rules },
    players: ['ann', 'bob', 'cat'].map((id, i) => ({ id, name: id, color: '#fff', accessory: i, seed: i })),
  }
  const log: Entry[] = []
  let s: State = E.initialState(g)
  const run = (x: Entry | Err) => {
    if (E.isErr(x)) throw new Error(x.error)
    log.push(x)
    s = E.replay(g, log)
    return s
  }
  return { g, log, run, get s() { return s } }
}

const rows: [string, number, number][] = []
const check = (label: string, expected: number, actual: number) => {
  rows.push([label, expected, actual])
  assert.equal(actual, expected, label)
}

test('rent table, hand checked against printed title deeds', () => {
  const t = setup()
  const med = idx('Mediterranean Avenue'), baltic = idx('Baltic Avenue'), bw = idx('Boardwalk'), pp = idx('Park Place')
  t.run(E.buy(t.g, t.s, 'ann', med))
  check('Mediterranean base rent', 2, E.rent(t.g, t.s, med).amount)
  t.run(E.buy(t.g, t.s, 'ann', baltic))
  check('Mediterranean, full unimproved set', 4, E.rent(t.g, t.s, med).amount)
  const plain = setup({ setDoubleRent: false })
  plain.run(E.buy(plain.g, plain.s, 'ann', med)); plain.run(E.buy(plain.g, plain.s, 'ann', baltic))
  check('Full set with double rent rule off', 2, E.rent(plain.g, plain.s, med).amount)

  t.run(E.transfer(t.g, t.s, 'bank', 'bob', 10000, 'test float'))
  t.run(E.buy(t.g, t.s, 'bob', pp)); t.run(E.buy(t.g, t.s, 'bob', bw))
  for (let k = 0; k < 5; k++) { t.run(E.build(t.g, t.s, pp)); t.run(E.build(t.g, t.s, bw)) }
  check('Boardwalk with a hotel', 2000, E.rent(t.g, t.s, bw).amount)
  check('Park Place with a hotel', 1500, E.rent(t.g, t.s, pp).amount)

  const r = setup()
  const rails = ['Reading Railroad', 'Pennsylvania Railroad', 'B&O Railroad', 'Short Line'].map(idx)
  const expect = [25, 50, 100, 200]
  rails.forEach((cell, k) => {
    r.run(E.buy(r.g, r.s, 'cat', cell))
    check(`${k + 1} railroads owned`, expect[k], E.rent(r.g, r.s, rails[0]).amount)
  })
  check('Nearest railroad card, 4 owned', 400, E.rent(r.g, r.s, rails[0], { railroadMultiplier: 2 }).amount)

  const u = setup()
  const ec = idx('Electric Company'), ww = idx('Water Works')
  u.run(E.buy(u.g, u.s, 'ann', ec))
  check('Utility, dice 7, one owned', 28, E.rent(u.g, u.s, ec, { dice: 7 }).amount)
  check('Nearest utility card, dice 7', 70, E.rent(u.g, u.s, ec, { dice: 7, utilityMax: true }).amount)
  u.run(E.buy(u.g, u.s, 'ann', ww))
  check('Utility, dice 7, both owned', 70, E.rent(u.g, u.s, ec, { dice: 7 }).amount)
})

test('rent moves money, mortgaged and jail rules', () => {
  const t = setup({ noRentInJail: true })
  const med = idx('Mediterranean Avenue')
  t.run(E.buy(t.g, t.s, 'ann', med))
  t.run(E.payRent(t.g, t.s, 'bob', med))
  check('Ann after buying for 60 and 2 rent', 1442, t.s.cash.ann)
  check('Bob after paying 2 rent', 1498, t.s.cash.bob)
  t.run(E.goToJail(t.g, 'ann'))
  assert.ok(E.isErr(E.payRent(t.g, t.s, 'bob', med)), 'no rent while owner in jail')
  t.run(E.leaveJail(t.g, t.s, 'ann', 'fine'))
  check('Jail fine goes into the pot', 50, t.s.pot)
  t.run(E.mortgage(t.g, t.s, med))
  check('Mortgage pays half of 60', 1392 + 30, t.s.cash.ann)
  assert.ok(E.isErr(E.payRent(t.g, t.s, 'bob', med)), 'no rent on mortgaged')
  check('Unmortgage cost 30 plus 10% = 33', 33, E.unmortgageCost(t.g, med))
  t.run(E.unmortgage(t.g, t.s, med))
  check('Ann after lifting mortgage', 1422 - 33, t.s.cash.ann)
  check('Unmortgage Park Place 175 plus 10% rounds up to 193', 193, E.unmortgageCost(t.g, idx('Park Place')))
})

test('building rules: even building and bank supply', () => {
  const t = setup()
  const [a, b, c] = ['Oriental Avenue', 'Vermont Avenue', 'Connecticut Avenue'].map(idx)
  t.run(E.buy(t.g, t.s, 'ann', a)); t.run(E.buy(t.g, t.s, 'ann', b))
  assert.equal(E.canBuild(t.g, t.s, a), 'Own the whole colour set first')
  t.run(E.buy(t.g, t.s, 'ann', c))
  t.run(E.build(t.g, t.s, a))
  assert.match(E.canBuild(t.g, t.s, a)!, /Build evenly/)
  t.run(E.build(t.g, t.s, b)); t.run(E.build(t.g, t.s, c))
  check('Houses left after 3 built', 29, E.housesLeft(t.g, t.s))
  t.run(E.build(t.g, t.s, a))
  assert.match(E.canSell(t.g, t.s, b)!, /Sell evenly/)
  assert.equal(E.canSell(t.g, t.s, a), null)
  const m = E.mortgage(t.g, t.s, b)
  assert.ok(E.isErr(m) && /Sell every building/.test(m.error), 'cannot mortgage while the set has buildings')
})

test('repairs card, 3 houses and 1 hotel at 25 and 100', () => {
  const t = setup({ evenBuild: false })
  t.run(E.transfer(t.g, t.s, 'bank', 'ann', 5000, 'float'))
  const [m, bl] = ['Mediterranean Avenue', 'Baltic Avenue'].map(idx)
  t.run(E.buy(t.g, t.s, 'ann', m)); t.run(E.buy(t.g, t.s, 'ann', bl))
  for (let k = 0; k < 5; k++) t.run(E.build(t.g, t.s, m)) // hotel on Mediterranean
  for (let k = 0; k < 3; k++) t.run(E.build(t.g, t.s, bl)) // 3 houses on Baltic
  const before = t.s.cash.ann
  const card = US.chance.find(c => c.effect.type === 'repairs')!
  t.run(E.drawCard(t.g, t.s, 'ann', card))
  check('Repairs: 3 houses x 25 + 1 hotel x 100', 175, before - t.s.cash.ann)
  check('Hotel returned 4 houses: 32 minus 3 on Baltic', 29, E.housesLeft(t.g, t.s))
  check('Hotels left', 11, E.hotelsLeft(t.g, t.s))
})

test('free parking pot, birthday card, pass go', () => {
  const t = setup({ doubleGo: true })
  t.run(E.payTax(t.g, t.s, 'ann', idx('Income Tax')))
  t.run(E.payTax(t.g, t.s, 'bob', idx('Luxury Tax')))
  check('Pot after 200 and 100 tax', 300, t.s.pot)
  t.run(E.collectPot(t.g, t.s, 'cat'))
  check('Cat collects the pot', 1800, t.s.cash.cat)
  check('Pot emptied', 0, t.s.pot)
  const bday = US.chest.find(c => c.effect.type === 'collectEach')!
  t.run(E.drawCard(t.g, t.s, 'cat', bday))
  check('Birthday: 10 from each of 2 players', 1820, t.s.cash.cat)
  t.run(E.passGo(t.g, 'ann', true))
  check('Landing exactly on Go pays double with rule on', 1300 - 10 + 400, t.s.cash.ann)
})

test('trade with mortgage interest', () => {
  const t = setup()
  const med = idx('Mediterranean Avenue')
  t.run(E.buy(t.g, t.s, 'ann', med))
  t.run(E.mortgage(t.g, t.s, med))
  t.run(E.trade(t.g, t.s, 'ann', 'bob', { cells: [med], cash: 0, jailCards: 0 }, { cells: [], cash: 100, jailCards: 0 }))
  assert.equal(t.s.owner[med], 'bob')
  check('Bob pays 100 plus 10% of 30 = 3 interest', 1500 - 103, t.s.cash.bob)
  check('Ann: 1500 minus 60 plus 30 plus 100', 1570, t.s.cash.ann)
})

test('bankruptcy hands everything to the creditor', () => {
  const t = setup()
  const [m, bl] = ['Mediterranean Avenue', 'Baltic Avenue'].map(idx)
  t.run(E.buy(t.g, t.s, 'ann', m)); t.run(E.buy(t.g, t.s, 'ann', bl))
  t.run(E.build(t.g, t.s, m)); t.run(E.build(t.g, t.s, bl))
  const annCash = t.s.cash.ann // 1500 - 120 - 100 = 1280
  t.run(E.bankrupt(t.g, t.s, 'ann', 'bob'))
  check('Bob gets cash plus half of 2 houses at 50', 1500 + annCash + 50, t.s.cash.bob)
  assert.equal(t.s.owner[m], 'bob'); assert.equal(t.s.level[m], 0)
  assert.equal(E.nextPlayer(t.g, t.s), 'bob')
  t.run(E.endTurn(t.g, t.s))
  assert.equal(E.nextPlayer(t.g, t.s), 'cat')
})

test('money is conserved and undo replays exactly', () => {
  const t = setup()
  const total = () => Object.values(t.s.cash).reduce((a, b) => a + b, 0) + t.s.pot + t.s.bank
  const start = total()
  t.run(E.buy(t.g, t.s, 'ann', idx('Boardwalk')))
  t.run(E.payTax(t.g, t.s, 'bob', idx('Income Tax')))
  t.run(E.passGo(t.g, 'cat'))
  t.run(E.payRent(t.g, t.s, 'cat', idx('Boardwalk')))
  check('Cash plus pot plus bank intake is constant', start, total())
  const before = JSON.stringify(E.replay(t.g, t.log.slice(0, 2)))
  const s2 = JSON.stringify(E.replay(t.g, t.log.slice(0, 2)))
  assert.equal(before, s2)
  check('Undo of last two entries restores cat', 1500, E.replay(t.g, t.log.slice(0, 2)).cash.cat)
})

test('net worth', () => {
  const t = setup()
  const [m, bl, rr] = ['Mediterranean Avenue', 'Baltic Avenue', 'Reading Railroad'].map(idx)
  t.run(E.buy(t.g, t.s, 'ann', m)); t.run(E.buy(t.g, t.s, 'ann', bl)); t.run(E.buy(t.g, t.s, 'ann', rr))
  t.run(E.build(t.g, t.s, m))
  t.run(E.mortgage(t.g, t.s, rr))
  const w = E.netWorth(t.g, t.s, 'ann')
  // cash 1500 - 60 - 60 - 200 - 50 + 100 = 1230; property 60 + 60 + 100 (mortgaged half) = 220; buildings 50
  check('Net worth cash', 1230, w.cash)
  check('Net worth property', 220, w.property)
  check('Net worth buildings', 50, w.buildings)
  check('Net worth total', 1500, w.total)
  check('Could raise: cash + 30 + 30 mortgages + 25 house', 1315, w.raisable)
})

test.after(() => {
  console.log('\n  check'.padEnd(62) + 'expected  actual')
  for (const [l, e, a] of rows) console.log(`  ${l.padEnd(58)} ${String(e).padStart(8)} ${String(a).padStart(7)}${e === a ? '' : '  MISMATCH'}`)
})
