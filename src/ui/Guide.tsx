import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { Monitor, Smartphone } from 'lucide-react'
import { useUI } from './ctx.ts'

type Box = [x: number, y: number, w: number, h: number] // fractions of the picture
type Shot = { w: number; h: number; phone?: boolean; marks: Record<string, Box> }

/** Screenshots in public/guide, with the boxes of the buttons that matter, measured from the app when they were taken. */
const SHOTS = {
  lobby: { w: 1012, h: 207, marks: { newLedger: [0.0326, 0.5696, 0.2797, 0.2708], host: [0.3601, 0.5696, 0.1359, 0.2332], join: [0.5039, 0.5696, 0.1359, 0.2332] } },
  setup: { w: 741, h: 423, marks: { name: [0.0418, 0.4523, 0.9163, 0.1041], open: [0.7189, 0.0237, 0.2676, 0.1325] } },
  turn: { w: 587, h: 631, marks: { landed: [0.0521, 0.558, 0.8958, 0.0888], go: [0.0521, 0.6595, 0.4411, 0.0698], next: [0.4186, 0.8564, 0.5293, 0.0888] } },
  landed: { w: 760, h: 270, marks: { search: [0.0329, 0.5354, 0.9342, 0.163], square: [0.0329, 0.7429, 0.9342, 0.1645] } },
  buy: { w: 1040, h: 492, marks: { buy: [0.3356, 0.3914, 0.1627, 0.1139] } },
  tablerent: { w: 1040, h: 540, marks: { amount: [0.3356, 0.2703, 0.6404, 0.0811], pay: [0.3356, 0.4477, 0.1594, 0.1037] } },
  build: { w: 1040, h: 563, marks: { house: [0.6769, 0.6048, 0.0878, 0.0782] } },
  undo: { w: 640, h: 240, marks: { undo: [0.8, 0.7833, 0.1516, 0.1833] } },
  hostqr: { w: 737, h: 268, marks: { qr: [0.0393, 0.1866, 0.228, 0.6269], code: [0.2944, 0.1618, 0.6391, 0.1719] } },
  pick: { w: 390, h: 844, phone: true, marks: { name: [0.0949, 0.2611, 0.8103, 0.0521], colour: [0.0949, 0.3274, 0.8103, 0.2628], creature: [0.0949, 0.6044, 0.8103, 0.3007], seat: [0.0949, 0.9335, 0.8103, 0.0664] } },
  hostplayers: { w: 741, h: 674, marks: { players: [0.0418, 0.7647, 0.9163, 0.2205], open: [0.7189, 0.0148, 0.2676, 0.0831] } },
  dash: { w: 390, h: 844, phone: true, marks: { cash: [0.357, 0.3181, 0.2859, 0.0597], landed: [0.0887, 0.5859, 0.8226, 0.0664] } },
  rent: { w: 390, h: 844, phone: true, marks: { amount: [0.1128, 0.7033, 0.7744, 0.0519], pay: [0.1128, 0.8168, 0.425, 0.0664] } },
  wait: { w: 390, h: 844, phone: true, marks: { wait: [0.041, 0.4505, 0.9179, 0.3373] } },
  offer: { w: 390, h: 844, phone: true, marks: { refuse: [0.4286, 0.5616, 0.2173, 0.0521], accept: [0.6623, 0.5616, 0.2531, 0.0521] } },
  approve: { w: 587, h: 293, marks: { approve: [0.7591, 0.7565, 0.1915, 0.1501] } },
} satisfies Record<string, Shot>

type Name = keyof typeof SHOTS
/** `arrow`: which side the arrow comes from (default: whichever has more room), or none where numbers say enough. */
type Arrow = 'above' | 'below' | false
type Step = { where?: 'screen' | 'phone'; title: ReactNode; text: string; shot: Name; marks: string[]; arrow?: Arrow }

const OFFLINE: Step[] = [
  { title: <>Tap <b>Open a new ledger</b></>, text: 'This starts a new game.', shot: 'lobby', marks: ['newLedger'] },
  { title: <>Type each name and tap <b>Add player</b></>, text: 'Do this for everyone at the table. When everyone is in, tap Open the bank.', shot: 'setup', marks: ['name', 'open'] },
  { title: <>Roll the real dice, move your piece, then tap <b>Landed on</b></>, text: 'It is the big button at the top.', shot: 'turn', marks: ['landed'] },
  { title: <>Type where you landed and tap it</>, text: 'The first few letters are enough.', shot: 'landed', marks: ['search', 'square'] },
  { title: <>Nobody owns it? Tap <b>Buy</b></>, text: 'Or tap Auction it so everyone can bid, or Leave it.', shot: 'buy', marks: ['buy'] },
  { title: <>Someone owns it? <b>Pay</b> the rent</>, text: 'The app works out how much. Just tap Pay.', shot: 'tablerent', marks: ['amount', 'pay'] },
  { title: <>Went past Go? Tap <b>Passed Go</b></>, text: 'You collect your salary.', shot: 'turn', marks: ['go'] },
  { title: <>Own a whole colour set? Build a <b>House</b></>, text: 'Tap Build or mortgage, then the House button next to your street.', shot: 'build', marks: ['house'] },
  { title: <>All done? Tap <b>Next</b></>, text: 'Now it is the next player’s turn.', shot: 'turn', marks: ['next'] },
  { title: <>Tapped the wrong thing? Tap <b>Undo</b></>, text: 'It takes back the last thing. Nothing is lost.', shot: 'undo', marks: ['undo'] },
]

const ONLINE: Step[] = [
  { where: 'screen', title: <>Tap <b>Host a session</b></>, text: 'Do this on the big screen: a laptop, a tablet or a TV.', shot: 'lobby', marks: ['host'] },
  { where: 'screen', title: <>Everyone scans the <b>square code</b> with their phone camera</>, text: 'No camera? Open monopoly-manage.vercel.app, tap Join a session and type the five letters.', shot: 'hostqr', marks: ['qr', 'code'] },
  { where: 'phone', title: <>Type your name, pick a colour and a hat, then tap <b>Take my seat</b></>, text: 'Colours someone already picked are gone from the list.', shot: 'pick', marks: ['name', 'colour', 'creature', 'seat'], arrow: false },
  { where: 'screen', title: <>When everyone shows up, tap <b>Open the bank</b></>, text: 'A little phone next to a name means that player is on their phone.', shot: 'hostplayers', marks: ['players', 'open'] },
  { where: 'phone', title: <>This is your money. On your turn, tap <b>Landed on</b></>, text: 'Then pick the square, just like on the big screen.', shot: 'dash', marks: ['cash', 'landed'] },
  { where: 'phone', title: <>You pay your own rent: tap <b>Pay</b></>, text: 'Your phone shows how much and who gets it.', shot: 'rent', marks: ['amount', 'pay'] },
  { where: 'phone', title: <>Not your turn? Look at the <b>big screen</b></>, text: 'You can still build, mortgage and make deals while you wait.', shot: 'wait', marks: ['wait'] },
  { where: 'phone', title: <>Someone offers you a deal? Tap <b>Accept</b> or <b>Refuse</b></>, text: 'Nothing happens until you say yes.', shot: 'offer', marks: ['refuse', 'accept'], arrow: 'below' },
  { where: 'screen', title: <>The banker says yes last: <b>Approve</b></>, text: 'Deals, undo and going bankrupt wait for a tap on the big screen.', shot: 'approve', marks: ['approve'] },
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
            <text x={r.x - p} y={r.y - p} dy="0.35em" textAnchor="middle" fontSize={17 * k} fontWeight="700" fill="#fff" fontFamily="Jost, system-ui, sans-serif">{i + 1}</text>
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
  { id: 'offline', icon: <Monitor size={22} />, label: 'One screen for everyone', lead: 'One laptop or tablet sits next to the board. One person, the banker, taps the buttons. Everyone else just plays.', steps: OFFLINE },
  { id: 'online', icon: <Smartphone size={22} />, label: 'Everyone on their own phone', lead: 'One big screen is the bank, and everyone uses their own phone. You need the internet on every device.', steps: ONLINE },
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
              <p className="muted">{s.text}</p>
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
