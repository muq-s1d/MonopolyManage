import type { Board, Card, Cell, Group } from './types.ts'

// Prices and rents cross-checked 2026-09-25 against github.com/Kau5hik46/monopoly-markov-chain data/board.us.json.
// The UK board uses the same numbers with London names.

const P = (name: string, group: string, price: number, houseCost: number, rents: number[]): Cell =>
  ({ kind: 'property', name, group, price, houseCost, rents })
const R = (name: string): Cell => ({ kind: 'railroad', name, price: 200 })
const U = (name: string): Cell => ({ kind: 'utility', name, price: 150 })
const T = (name: string, amount: number): Cell => ({ kind: 'tax', name, amount })
const S = (kind: Cell['kind'], name: string): Cell => ({ kind, name })

const groups: Group[] = [
  { id: 'brown', name: 'Brown', color: '#7B4B2A' },
  { id: 'light', name: 'Light Blue', color: '#8FC6E0' },
  { id: 'pink', name: 'Pink', color: '#B8387E' },
  { id: 'orange', name: 'Orange', color: '#E08A2E' },
  { id: 'red', name: 'Red', color: '#C0392B' },
  { id: 'yellow', name: 'Yellow', color: '#E7C53A' },
  { id: 'green', name: 'Green', color: '#2E8B57' },
  { id: 'blue', name: 'Dark Blue', color: '#1F4E8C' },
]

// Rent tables shared by both classic boards, in board order.
const rents = {
  a: [2, 10, 30, 90, 160, 250], b: [4, 20, 60, 180, 320, 450],
  c: [6, 30, 90, 270, 400, 550], d: [8, 40, 100, 300, 450, 600],
  e: [10, 50, 150, 450, 625, 750], f: [12, 60, 180, 500, 700, 900],
  g: [14, 70, 200, 550, 750, 950], h: [16, 80, 220, 600, 800, 1000],
  i: [18, 90, 250, 700, 875, 1050], j: [20, 100, 300, 750, 925, 1100],
  k: [22, 110, 330, 800, 975, 1150], l: [24, 120, 360, 850, 1025, 1200],
  m: [26, 130, 390, 900, 1100, 1275], n: [28, 150, 450, 1000, 1200, 1400],
  o: [35, 175, 500, 1100, 1300, 1500], p: [50, 200, 600, 1400, 1700, 2000],
}

// {cell} in a title is replaced with that board's cell name, so one deck serves every classic layout.
const chance: Card[] = [
  { title: 'Advance to {cell}', effect: { type: 'advance', cell: 39 } },
  { title: 'Advance to Go', effect: { type: 'advance', cell: 0 } },
  { title: 'Advance to {cell}', effect: { type: 'advance', cell: 24 } },
  { title: 'Advance to {cell}', effect: { type: 'advance', cell: 11 } },
  { title: 'Advance to the nearest railroad and pay double rent', effect: { type: 'nearest', kind: 'railroad' } },
  { title: 'Advance to the nearest railroad and pay double rent', effect: { type: 'nearest', kind: 'railroad' } },
  { title: 'Advance to the nearest utility and pay ten times the dice', effect: { type: 'nearest', kind: 'utility' } },
  { title: 'Bank pays you a dividend', effect: { type: 'collect', amount: 50 } },
  { title: 'Get out of jail free', effect: { type: 'jailCard' } },
  { title: 'Go back three spaces', effect: { type: 'move' } },
  { title: 'Go to jail', effect: { type: 'jail' } },
  { title: 'General repairs on all your property', effect: { type: 'repairs', house: 25, hotel: 100 } },
  { title: 'Speeding fine', effect: { type: 'pay', amount: 15 } },
  { title: 'Take a trip to {cell}', effect: { type: 'advance', cell: 5 } },
  { title: 'Elected chairman of the board, pay each player', effect: { type: 'payEach', amount: 50 } },
  { title: 'Your building loan matures', effect: { type: 'collect', amount: 150 } },
]

const chest: Card[] = [
  { title: 'Advance to Go', effect: { type: 'advance', cell: 0 } },
  { title: 'Bank error in your favour', effect: { type: 'collect', amount: 200 } },
  { title: "Doctor's fee", effect: { type: 'pay', amount: 50 } },
  { title: 'From sale of stock', effect: { type: 'collect', amount: 50 } },
  { title: 'Get out of jail free', effect: { type: 'jailCard' } },
  { title: 'Go to jail', effect: { type: 'jail' } },
  { title: 'Holiday fund matures', effect: { type: 'collect', amount: 100 } },
  { title: 'Income tax refund', effect: { type: 'collect', amount: 20 } },
  { title: 'It is your birthday, collect from every player', effect: { type: 'collectEach', amount: 10 } },
  { title: 'Life insurance matures', effect: { type: 'collect', amount: 100 } },
  { title: 'Hospital fees', effect: { type: 'pay', amount: 100 } },
  { title: 'School fees', effect: { type: 'pay', amount: 50 } },
  { title: 'Consultancy fee', effect: { type: 'collect', amount: 25 } },
  { title: 'Assessed for street repairs', effect: { type: 'repairs', house: 40, hotel: 115 } },
  { title: 'Second prize in a beauty contest', effect: { type: 'collect', amount: 10 } },
  { title: 'You inherit', effect: { type: 'collect', amount: 100 } },
]

function classic(id: string, name: string, currency: string, n: string[]): Board {
  const r = rents
  const cells: Cell[] = [
    S('go', 'Go'), P(n[0], 'brown', 60, 50, r.a), S('chest', 'Community Chest'), P(n[1], 'brown', 60, 50, r.b),
    T(n[2], 200), R(n[3]), P(n[4], 'light', 100, 50, r.c), S('chance', 'Chance'), P(n[5], 'light', 100, 50, r.c),
    P(n[6], 'light', 120, 50, r.d), S('jail', 'Jail'), P(n[7], 'pink', 140, 100, r.e), U(n[8]),
    P(n[9], 'pink', 140, 100, r.e), P(n[10], 'pink', 160, 100, r.f), R(n[11]), P(n[12], 'orange', 180, 100, r.g),
    S('chest', 'Community Chest'), P(n[13], 'orange', 180, 100, r.g), P(n[14], 'orange', 200, 100, r.h),
    S('parking', 'Free Parking'), P(n[15], 'red', 220, 150, r.i), S('chance', 'Chance'), P(n[16], 'red', 220, 150, r.i),
    P(n[17], 'red', 240, 150, r.j), R(n[18]), P(n[19], 'yellow', 260, 150, r.k), P(n[20], 'yellow', 260, 150, r.k),
    U(n[21]), P(n[22], 'yellow', 280, 150, r.l), S('gotojail', 'Go to Jail'), P(n[23], 'green', 300, 200, r.m),
    P(n[24], 'green', 300, 200, r.m), S('chest', 'Community Chest'), P(n[25], 'green', 320, 200, r.n), R(n[26]),
    S('chance', 'Chance'), P(n[27], 'blue', 350, 200, r.o), T(n[28], 100), P(n[29], 'blue', 400, 200, r.p),
  ]
  return {
    id, name, currency, salary: 200, startingCash: 1500, jailFine: 50, houses: 32, hotels: 12,
    railroadRents: [25, 50, 100, 200], utilityMultipliers: [4, 10],
    groups: structuredClone(groups), cells, chance: structuredClone(chance), chest: structuredClone(chest),
  }
}

export const presets: Board[] = [
  classic('classic-us', 'Classic US', '$', [
    'Mediterranean Avenue', 'Baltic Avenue', 'Income Tax', 'Reading Railroad', 'Oriental Avenue', 'Vermont Avenue',
    'Connecticut Avenue', 'St. Charles Place', 'Electric Company', 'States Avenue', 'Virginia Avenue',
    'Pennsylvania Railroad', 'St. James Place', 'Tennessee Avenue', 'New York Avenue', 'Kentucky Avenue',
    'Indiana Avenue', 'Illinois Avenue', 'B&O Railroad', 'Atlantic Avenue', 'Ventnor Avenue', 'Water Works',
    'Marvin Gardens', 'Pacific Avenue', 'North Carolina Avenue', 'Pennsylvania Avenue', 'Short Line',
    'Park Place', 'Luxury Tax', 'Boardwalk',
  ]),
  classic('classic-uk', 'UK London', '£', [
    'Old Kent Road', 'Whitechapel Road', 'Income Tax', "King's Cross Station", 'The Angel Islington', 'Euston Road',
    'Pentonville Road', 'Pall Mall', 'Electric Company', 'Whitehall', 'Northumberland Avenue',
    'Marylebone Station', 'Bow Street', 'Marlborough Street', 'Vine Street', 'Strand',
    'Fleet Street', 'Trafalgar Square', 'Fenchurch St. Station', 'Leicester Square', 'Coventry Street', 'Water Works',
    'Piccadilly', 'Regent Street', 'Oxford Street', 'Bond Street', 'Liverpool St. Station',
    'Park Lane', 'Super Tax', 'Mayfair',
  ]),
]
