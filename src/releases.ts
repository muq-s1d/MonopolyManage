/** Release notes, newest first. The first entry is the current version (keep package.json in step). */
export type Release = { version: string; date: string; title: string; items: { lead: string; text: string }[] }

export const RELEASES: Release[] = [
  {
    version: '1.2.0',
    date: '2026-09-26',
    title: 'Everyone on their own phone',
    items: [
      { lead: 'Host a session', text: 'The host screen shows a QR code and a five letter code. Players join from their own phones and pick a name, a colour and a creature.' },
      { lead: 'Your own dashboard', text: 'Each phone shows your creature, your cash and your net worth, with your turn buttons when it is your go.' },
      { lead: 'Pay your own rent', text: 'The player who landed taps Pay. The payer sees money leave, the owner sees it arrive.' },
      { lead: 'The host approves', text: 'Deals go to the other player, then the host. Undo and bankruptcy wait for the host.' },
      { lead: 'Cartoon moments', text: 'Every notable event plays a short animation and a sound on every device. Big ones get a full screen scene you can tap to skip.' },
      { lead: 'Back in one tap', text: 'A reloaded phone keeps its seat, and a reopened host screen resumes the session.' },
      { lead: 'How to use', text: 'A new button at the bottom of the lobby opens a step by step guide with pictures, for one screen or for everyone’s phones.' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-26',
    title: 'Deals between players',
    items: [
      { lead: 'A new Deals button', text: 'Trade has become Deals, with four tabs: Trade, Pact, Loan and Free rent.' },
      { lead: 'Alliances', text: 'Team up in a pact to pool colour sets, railroads or utilities. Build houses together and split the rent and costs by the shares you agree.' },
      { lead: 'Your choice on ally rent', text: 'Each pact decides whether allies stay free on its properties or pay the others.' },
      { lead: 'Loans', text: 'Lend money with interest and a due round. The borrower gets a reminder on their turn.' },
      { lead: 'Free rent passes', text: 'Buy a number of free landings on another player’s properties.' },
      { lead: 'Easier trades', text: 'Each side now reads “Riva gives”, and the summary says plainly who gets what.' },
      { lead: 'Shares that add up', text: 'Type one share and the others adjust to keep 100%.' },
      { lead: 'Matching sashes', text: 'Allies wear sashes in their pact’s colour on the stage.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-25',
    title: 'The first release',
    items: [
      { lead: 'The bank for game night', text: 'Buying, rent, building, mortgages, trades, jail and turns, with every dollar written in an undoable ledger.' },
      { lead: '3D creatures and sounds', text: 'Each player gets a creature in a 1930s accessory, and arcade style sounds for every move.' },
      { lead: 'Your own boards', text: 'Copy a classic board and change any name, price, rent or card.' },
    ],
  },
]

export const CURRENT = RELEASES[0]
