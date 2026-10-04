/** Release notes, newest first. The first entry is the current version (keep package.json in step). */
export type Release = { version: string; date: string; title: string; items: { lead: string; text: string }[] }

export const RELEASES: Release[] = [
  {
    version: '1.3.1',
    date: '2026-10-04',
    title: 'Only where you can land',
    items: [
      { lead: 'Only reachable squares', text: 'A roll can only land on the squares 2 to 12 ahead, so those are the only ones you can buy or pay on. Tap any other square and you see its deed, nothing more. A card that moves you lights up the one square it names with a star.' },
      { lead: 'Utility rent from the roll', text: 'The board knows how far you moved, so a utility charges on that roll without asking for the dice.' },
      { lead: 'Nobody can act as you', text: 'Each phone now signs what it sends with a key that never leaves it. A copied, changed or replayed message is thrown away, so nobody listening in can pay out your money or answer your deals.' },
      { lead: 'The host phone code works once', text: 'The QR code that makes a phone the host’s own changes as soon as it is used.' },
      { lead: 'Sturdier sessions', text: 'Long games reach a reconnecting phone in pieces, so they never hit the size limit. Odd amounts are refused, and each player can have five requests waiting at most.' },
      { lead: 'Host fixes', text: 'If a piece was moved without being recorded, the host screen can still record a landing on any square from its deed.' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-09-27',
    title: 'Tap the board',
    items: [
      { lead: 'Tap where you land', text: 'The Landed on list is gone. Roll, move, then tap the square on the board. The numbers on it are dice totals, so a 7 means tap the 7.' },
      { lead: 'One square per roll', text: 'Each roll records one landing, and a double gets another. A wrong tap is fixed with Undo, which the host approves.' },
      { lead: 'Go pays itself', text: 'The app knows where every piece stands, so passing Go pays the salary with the landing. Every piece shows on the board.' },
      { lead: 'Live auctions', text: 'Auction a deed and every phone gets bid buttons with a countdown. Whoever starts it picks the steps, like $10, $20 and $50. The host screen bids for players without a phone.' },
      { lead: 'Easier to read', text: 'New fonts, no more shouty capitals, and far fewer explanations in the way.' },
    ],
  },
  {
    version: '1.2.1',
    date: '2026-09-26',
    title: 'Deals with players who have no phone',
    items: [
      { lead: 'Deals go through', text: 'A player the host added by hand has no phone to say yes with, so a deal with them waited forever. Now the host answers for them: one tap on Approve.' },
      { lead: 'Clear about it', text: 'The host’s request tray says which players have no phone, so the host knows they are deciding for them.' },
    ],
  },
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
