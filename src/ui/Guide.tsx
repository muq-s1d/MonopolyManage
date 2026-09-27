import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { Monitor, Smartphone } from 'lucide-react'
import { useUI } from './ctx.ts'

type Box = [x: number, y: number, w: number, h: number] // fractions of the picture
type Shot = { w: number; h: number; phone?: boolean; marks: Record<string, Box> }

/** Screenshots in public/guide, with the boxes of the buttons that matter, measured from the app when they were taken. */
const SHOTS = {
  lobby: { w: 1012, h: 146, marks: { newLedger: [0.0326, 0.3911, 0.2797, 0.3831], host: [0.3601, 0.3911, 0.1359, 0.301], join: [0.5039, 0.3911, 0.1359, 0.301] } },
  setup: { w: 1172, h: 486, marks: { name: [0.0282, 0.4388, 0.479, 0.0906], open: [0.8513, 0.0425, 0.1384, 0.1153] } },
  turn: { w: 1366, h: 800, marks: { square: [0.5066, 0.739, 0.0549, 0.0647] } },
  tablerent: { w: 1040, h: 535, marks: { amount: [0.3356, 0.2765, 0.6404, 0.0777], pay: [0.3356, 0.4498, 0.1353, 0.1046] } },
  buy: { w: 1040, h: 487, marks: { buy: [0.3356, 0.3956, 0.1395, 0.1149], auction: [0.4843, 0.408, 0.0981, 0.0903] } },
  done: { w: 649, h: 429, marks: { yes: [0.0286, 0.5444, 0.3721, 0.1306], end: [0.4131, 0.5444, 0.5582, 0.1306] } },
  undo: { w: 640, h: 240, marks: { undo: [0.8019, 0.7833, 0.1497, 0.1833] } },
  build: { w: 1040, h: 581, marks: { house: [0.6907, 0.475, 0.0858, 0.0758] } },
  hostqr: { w: 1148, h: 245, marks: { qr: [0.0183, 0.1568, 0.1463, 0.6863], code: [0.1821, 0.1518, 0.7822, 0.2353] } },
  pick: { w: 390, h: 844, phone: true, marks: { name: [0.0949, 0.2393, 0.8103, 0.0792], colour: [0.0949, 0.3328, 0.8103, 0.266], creature: [0.0949, 0.6129, 0.8103, 0.2413], seat: [0.0949, 0.8827, 0.8103, 0.0664] } },
  hostplayers: { w: 1172, h: 848, marks: { players: [0.0282, 0.6247, 0.479, 0.3364], open: [0.8513, 0.0243, 0.1384, 0.066] } },
  dash: { w: 390, h: 844, phone: true, marks: { board: [0.0887, 0.474, 0.8226, 0.3801], cash: [0.359, 0.1217, 0.6, 0.0517] } },
  auction: { w: 390, h: 844, phone: true, marks: { bids: [0.0436, 0.8502, 0.9128, 0.0711], out: [0.0436, 0.9308, 0.2906, 0.0521] } },
  rent: { w: 390, h: 844, phone: true, marks: { amount: [0.1128, 0.7007, 0.7744, 0.0493], pay: [0.1128, 0.8106, 0.3448, 0.0664] } },
  wait: { w: 390, h: 844, phone: true, marks: { wait: [0.041, 0.2284, 0.9179, 0.621] } },
  offer: { w: 390, h: 844, phone: true, marks: { refuse: [0.4313, 0.3398, 0.2135, 0.0521], accept: [0.6612, 0.3398, 0.2542, 0.0521] } },
  approve: { w: 494, h: 153, marks: { approve: [0.7443, 0.6127, 0.2214, 0.2869] } },
} satisfies Record<string, Shot>

type Name = keyof typeof SHOTS
/** `arrow`: which side the arrow comes from (default: whichever has more room), or none where numbers say enough. */
type Arrow = 'above' | 'below' | false
type Step = { where?: 'screen' | 'phone'; title: ReactNode; text: string; shot: Name; marks: string[]; arrow?: Arrow }

const OFFLINE: Step[] = [
  { title: <>Tap <b>Open a new ledger</b></>, text: 'This starts a new game.', shot: 'lobby', marks: ['newLedger'] },
  { title: <>Type each name and tap <b>Add player</b></>, text: 'When everyone is in, tap Open the bank.', shot: 'setup', marks: ['name', 'open'] },
  { title: <>Roll the dice, move your piece, then <b>tap the square</b></>, text: 'The numbers on the board are dice totals. Rolled an 8? Tap the 8.', shot: 'turn', marks: ['square'] },
  { title: <>Nobody owns it? Tap <b>Buy</b></>, text: 'Or Auction it, and everyone bids.', shot: 'buy', marks: ['buy', 'auction'] },
  { title: <>Someone owns it? <b>Pay</b> the rent</>, text: 'The app works out how much. Passing Go pays you by itself.', shot: 'tablerent', marks: ['amount', 'pay'] },
  { title: <>Rolled a double? Tap <b>Yes</b>. If not, <b>End turn</b></>, text: 'Each roll gets one square. A double gets another.', shot: 'done', marks: ['yes', 'end'], arrow: 'below' },
  { title: <>Own a whole colour set? Build a <b>House</b></>, text: 'Tap Build or mortgage, then House.', shot: 'build', marks: ['house'] },
  { title: <>Tapped the wrong thing? Tap <b>Undo</b></>, text: 'It takes back the last thing.', shot: 'undo', marks: ['undo'] },
]

const ONLINE: Step[] = [
  { where: 'screen', title: <>Tap <b>Host a session</b></>, text: 'On the big screen: a laptop, a tablet or a TV.', shot: 'lobby', marks: ['host'] },
  { where: 'screen', title: <>Everyone scans the <b>square code</b></>, text: 'No camera? Tap Join a session and type the five letters.', shot: 'hostqr', marks: ['qr', 'code'] },
  { where: 'phone', title: <>Type your name, pick a colour and a hat, then tap <b>Take my seat</b></>, text: '', shot: 'pick', marks: ['name', 'colour', 'creature', 'seat'], arrow: false },
  { where: 'screen', title: <>Everyone is in? Tap <b>Open the bank</b></>, text: 'A phone next to a name means that player is on their phone.', shot: 'hostplayers', marks: ['players', 'open'] },
  { where: 'phone', title: <>Your turn: roll, move, then <b>tap the number you rolled</b></>, text: 'Your money is at the top.', shot: 'dash', marks: ['board', 'cash'], arrow: 'below' },
  { where: 'phone', title: <>Landed on someone’s street? Tap <b>Pay</b></>, text: 'Your phone shows how much.', shot: 'rent', marks: ['amount', 'pay'] },
  { where: 'phone', title: <>An auction? Tap a <b>bid</b>, or <b>I’m out</b></>, text: 'The top bid wins when the clock runs out.', shot: 'auction', marks: ['bids', 'out'] },
  { where: 'phone', title: <>Not your turn? Watch the <b>board</b></>, text: 'Every piece is on it. You can still build and make deals.', shot: 'wait', marks: ['wait'], arrow: false },
  { where: 'phone', title: <>Someone offers you a deal? <b>Accept</b> or <b>Refuse</b></>, text: 'Nothing happens until you say yes.', shot: 'offer', marks: ['refuse', 'accept'], arrow: 'below' },
  { where: 'screen', title: <>The banker says yes last: <b>Approve</b></>, text: 'Deals, undos and going bankrupt wait for this.', shot: 'approve', marks: ['approve'] },
]

/** A screenshot with the rest dimmed, each target ringed, numbered when there are several, and an arrow pointing in. */
function Picture({ name, marks, arrow: side }: { name: Name; marks: string[]; arrow?: Arrow }) {
  const s: Shot = SHOTS[name]
  const id = useId()
  const k = s.w / (s.phone ? 330 : 720) // picture units per screen pixel at full size, so rings and arrows look the same everywhere
  const boxes = marks.map(m => s.marks[m]).map(([x, y, w, h]) => ({ x: x * s.w, y: y * s.h, w: w * s.w, h: h * s.h }))
  const p = 6 * k
  // one arrow, to the first target, coming in from whichever side has more room
  const b = boxes[0], cx = b.x + b.w / 2, above = side ? side === 'above' : b.y + b.h / 2 > s.h / 2
  const end = { x: cx, y: above ? b.y - p - 4 * k : b.y + b.h + p + 4 * k }
  const reach = Math.min(90 * k, above ? end.y - 8 * k : s.h - end.y - 8 * k)
  const start = { x: Math.min(s.w - 12 * k, Math.max(12 * k, cx + (cx > s.w / 2 ? -1 : 1) * 110 * k)), y: end.y + (above ? -1 : 1) * reach }
  // the curve arrives straight down (target below it) or straight up, so the head is a plain triangle
  const dir = above ? 1 : -1
  const head = (r: number) => `${end.x},${end.y} ${end.x - 0.8 * r},${end.y - dir * r} ${end.x + 0.8 * r},${end.y - dir * r}`
  const arrow = `M${start.x} ${start.y} Q${end.x} ${start.y} ${end.x} ${end.y - dir * 18 * k}`
  // on a narrow screen a wide picture zooms in on its targets and arrow, so the buttons are big enough to read
  const xs = [...boxes.flatMap(r => [r.x, r.x + r.w]), ...(side === false ? [] : [start.x])], ys = [...boxes.flatMap(r => [r.y, r.y + r.h]), ...(side === false ? [] : [start.y])]
  const m = 50 * k
  const zx = Math.max(0, Math.min(...xs) - m), zy = Math.max(0, Math.min(...ys) - m)
  const zw = Math.min(s.w, Math.max(...xs) + m) - zx, zh = Math.min(s.h, Math.max(...ys) + m) - zy
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`
  const view = {
    '--ar': `${s.w} / ${s.h}`, '--zar': `${zw} / ${zh}`,
    '--zw': pct(s.w / zw), '--zx': pct(-zx / zw), '--zy': pct(-zy / zh),
  } as CSSProperties
  return (
    <figure className={`shot${s.phone ? ' phone' : ''}${zw < s.w * 0.8 ? ' zooms' : ''}`} style={view}>
      <div className="shot-inner">
      <img src={`/guide/${name}.webp`} width={s.w} height={s.h} alt="" loading="lazy" decoding="async" />
      <svg viewBox={`0 0 ${s.w} ${s.h}`} aria-hidden="true">
        <mask id={id}>
          <rect width={s.w} height={s.h} fill="white" />
          {boxes.map((r, i) => <rect key={i} x={r.x - p} y={r.y - p} width={r.w + 2 * p} height={r.h + 2 * p} rx={10 * k} fill="black" />)}
        </mask>
        <rect width={s.w} height={s.h} fill="rgb(0 0 0 / 0.55)" mask={`url(#${id})`} />
        {boxes.map((r, i) => (
          <g key={i} className="ring">
            <rect x={r.x - p} y={r.y - p} width={r.w + 2 * p} height={r.h + 2 * p} rx={10 * k} fill="none" stroke="#fff" strokeWidth={9 * k} />
            <rect x={r.x - p} y={r.y - p} width={r.w + 2 * p} height={r.h + 2 * p} rx={10 * k} fill="none" stroke="#FF4F5E" strokeWidth={5 * k} />
          </g>
        ))}
        {boxes.length > 1 && boxes.map((r, i) => (
          <g key={i}>
            <circle cx={r.x - p} cy={r.y - p} r={15 * k} fill="#FF4F5E" stroke="#fff" strokeWidth={3 * k} />
            <text x={r.x - p} y={r.y - p} dy="0.35em" textAnchor="middle" fontSize={17 * k} fontWeight="700" fill="#fff" fontFamily="Plus Jakarta Sans, system-ui, sans-serif">{i + 1}</text>
          </g>
        ))}
        {side !== false && <g className="arrow">
          <path d={arrow} fill="none" stroke="#fff" strokeWidth={13 * k} strokeLinecap="round" />
          <polygon points={head(30 * k)} fill="#fff" stroke="#fff" strokeWidth={6 * k} strokeLinejoin="round" />
          <path d={arrow} fill="none" stroke="#FF4F5E" strokeWidth={7 * k} strokeLinecap="round" />
          <polygon points={head(26 * k)} fill="#FF4F5E" />
        </g>}
      </svg>
      </div>
    </figure>
  )
}

const TABS = [
  { id: 'offline', icon: <Monitor size={22} />, label: 'One screen for everyone', lead: 'One laptop or tablet next to the board. The banker taps, everyone plays.', steps: OFFLINE },
  { id: 'online', icon: <Smartphone size={22} />, label: 'Everyone on their own phone', lead: 'A big screen is the bank, and everyone has their phone. Every device needs the internet.', steps: ONLINE },
] as const

export default function Guide() {
  const ui = useUI()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('offline')
  const t = TABS.find(x => x.id === tab)!
  return (
    <main className="guide">
      <header className="setup-head">
        <button className="ghost" onClick={() => ui.go('lobby')}>Back</button>
        <div>
          <p className="eyebrow">Step by step</p>
          <h1 className="display">How to use</h1>
        </div>
        <span />
      </header>
      <p className="guide-ask">How do you want to play?</p>
      <div className="guide-tabs" role="tablist" aria-label="How do you want to play">
        {TABS.map(x => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'plaque big' : 'ghost big'} onClick={() => setTab(x.id)}>
            {x.icon}{x.label}
          </button>
        ))}
      </div>
      <p className="guide-lead">{t.lead}</p>
      <ol className="guide-steps" role="tabpanel">
        {t.steps.map((s, i) => (
          <li key={`${tab}${i}`} className="guide-step">
            <span className="guide-num" aria-hidden="true">{i + 1}</span>
            <div className="guide-body">
              {s.where && <p className="guide-where">{s.where === 'phone' ? <><Smartphone size={16} /> On your phone</> : <><Monitor size={16} /> On the big screen</>}</p>}
              <h2 className="guide-title">{s.title}</h2>
              {s.text && <p className="muted">{s.text}</p>}
              <Picture name={s.shot} marks={s.marks} arrow={s.arrow} />
            </div>
          </li>
        ))}
      </ol>
      <div className="btn-row guide-end">
        <button className="plaque big" onClick={() => ui.go('lobby')}>Got it, let’s play</button>
      </div>
    </main>
  )
}
