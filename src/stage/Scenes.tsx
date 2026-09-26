import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Game, Player } from '../engine/types.ts'
import type { Ev } from '../ui/events.ts'
import Creature, { type Reaction } from './Creature.tsx'
import { Coins, coinCount, type Flight } from './Stage.tsx'

/** Big moments, about 2.6 seconds each, built from the stage's own creatures and coins. */

const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const now = () => performance.now() / 1000
const BRASS = new THREE.MeshStandardMaterial({ color: '#C9A24B', metalness: 0.55, roughness: 0.38 }) // the podium's brass: full metal reads black here

/** Seconds since the scene started, and a re-render as each mark in `marks` passes. */
function useBeat(marks: number[]) {
  const t0 = useMemo(now, [])
  const [passed, setPassed] = useState(0)
  useEffect(() => {
    const timers = marks.map((m, i) => setTimeout(() => setPassed(i + 1), m * 1000))
    return () => timers.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return { t0, passed }
}

const react = (kind: 'gain' | 'pay', delay = 0): Reaction => ({ kind, at: now() + delay })

function Actor({ player, x, y = 0, scale = 0.9, ...p }: { player: Player; x: number; y?: number; scale?: number } & Partial<Parameters<typeof Creature>[0]>) {
  return <Creature player={player} target={[x, y, 0]} scale={scale} active={false} jailed={false} bankrupt={false} low={false} proud={false} reaction={null} reduced={false} {...p} />
}

/** A flat card with text painted on a canvas, so nothing is fetched. */
function useLabel(text: string, bg: string, ink: string, w = 256, h = 128) {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')!
    g.fillStyle = bg; g.fillRect(0, 0, w, h)
    g.fillStyle = ink; g.font = `700 ${Math.round(h * 0.42)}px Jost, system-ui, sans-serif`
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(text, w / 2, h / 2 + 2, w * 0.9)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [text, bg, ink, w, h])
}

function Deed({ band, name, groupRef, position }: { band: string; name: string; groupRef?: React.RefObject<THREE.Group | null>; position?: [number, number, number] }) {
  const tex = useLabel(name.length > 14 ? name.split(' ')[0] : name, band, '#1B1A17', 256, 96)
  return (
    <group ref={groupRef} position={position}>
      <mesh><boxGeometry args={[1.1, 1.5, 0.03]} /><meshStandardMaterial color="#FBF6E9" roughness={0.8} /></mesh>
      <mesh position={[0, 0.5, 0.02]}><planeGeometry args={[0.96, 0.36]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
      {[-0.05, -0.22, -0.39, -0.56].map(y => <mesh key={y} position={[0, y, 0.02]}><planeGeometry args={[0.8, 0.04]} /><meshBasicMaterial color="#C8BFAA" /></mesh>)}
    </group>
  )
}

/** Confetti in one colour (or brass), falling and tumbling for the whole scene. */
function Confetti({ color, n = 70 }: { color: string; n?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const bits = useMemo(() => Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 7, z: (Math.random() - 0.5) * 2, v: 1.2 + Math.random() * 1.4, r: Math.random() * 6, d: Math.random() * 0.8 })), [n])
  const t0 = useMemo(now, [])
  const tmp = useMemo(() => new THREE.Object3D(), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6 }), [color])
  useFrame(() => {
    const t = now() - t0
    bits.forEach((b, i) => {
      const u = Math.max(0, t - b.d)
      tmp.position.set(b.x + Math.sin(u * 3 + b.r) * 0.3, 4 - u * b.v, b.z)
      tmp.rotation.set(u * 5 + b.r, u * 3, b.r)
      tmp.updateMatrix()
      ref.current.setMatrixAt(i, tmp.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[undefined, mat, n]} frustumCulled={false}><planeGeometry args={[0.12, 0.2]} /></instancedMesh>
}

function Buy({ game, ev }: { game: Game; ev: Ev }) {
  const me = game.players.find(p => p.id === ev.actor)!
  const c = game.board.cells[ev.cell ?? 0]
  const band = game.board.groups.find(g => g.id === c.group)?.color ?? '#E8C872'
  const card = useRef<THREE.Group>(null)
  const stamp = useRef<THREE.Mesh>(null!)
  const sold = useLabel('SOLD', '#FBF6E9', '#B8322F')
  const { t0, passed } = useBeat([1.3])
  useFrame(() => {
    const t = now() - t0, u = ease(t / 0.9)
    card.current!.position.set(THREE.MathUtils.lerp(0.7, 0.7, u), THREE.MathUtils.lerp(-1.9, 0.2, u), 0.4)
    card.current!.rotation.set(0, (1 - u) * Math.PI * 4, (1 - u) * 0.6 - 0.12)
    const s = t < 1 ? 0.001 : THREE.MathUtils.lerp(3, 1, ease((t - 1) / 0.18))
    stamp.current.scale.setScalar(s)
  })
  return (
    <>
      <mesh position={[0.7, -1.95, 0]} material={BRASS}><boxGeometry args={[1.6, 0.5, 1]} /></mesh>
      <Deed band={band} name={c.name} groupRef={card} />
      <mesh ref={stamp} position={[0.75, 0.2, 0.5]} rotation={[0, 0, 0.3]}><planeGeometry args={[1.1, 0.55]} /><meshBasicMaterial map={sold} transparent toneMapped={false} /></mesh>
      <Actor player={me} x={passed ? -0.35 : -1.2} proud={!!passed} reaction={passed ? react('gain') : null} />
    </>
  )
}

function Hotel({ game, ev }: { game: Game; ev: Ev }) {
  const me = game.players.find(p => p.id === ev.actor)!
  const hotel = useRef<THREE.Group>(null!)
  const puff = useRef<THREE.Group>(null!)
  const t0 = useMemo(now, [])
  useFrame(() => {
    const t = now() - t0
    const u = clamp01((t - 0.3) / 0.4)
    hotel.current.scale.set(1, Math.max(0.001, u < 1 ? ease(u) * 1.15 : 1 + Math.sin((t - 0.7) * 18) * 0.06 * Math.max(0, 1 - (t - 0.7) * 2)), 1)
    const p = clamp01((t - 0.5) / 0.9)
    puff.current.children.forEach((m, i) => {
      const a = (i / puff.current.children.length) * Math.PI * 2
      m.position.set(Math.cos(a) * (0.5 + p * 1.2), -0.9 + p * 0.3, Math.sin(a) * 0.5 * (0.5 + p))
      m.scale.setScalar(p > 0 && p < 1 ? 0.25 + p * 0.3 : 0.001)
      ;((m as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 1 - p
    })
  })
  return (
    <>
      <group position={[0.9, -1.05, 0]}>
        <group ref={hotel}>
          <mesh position={[0, 0.7, 0]}><boxGeometry args={[1.3, 1.4, 0.9]} /><meshStandardMaterial color="#B8322F" roughness={0.6} /></mesh>
          <mesh position={[0, 1.55, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[1.0, 0.5, 4]} /><meshStandardMaterial color="#7A1F2B" roughness={0.6} /></mesh>
          {[0.35, 0.8, 1.2].map(y => [-0.35, 0, 0.35].map(x => <mesh key={`${x}${y}`} position={[x, y, 0.46]}><planeGeometry args={[0.18, 0.2]} /><meshBasicMaterial color="#FFE7B0" /></mesh>))}
        </group>
        <group ref={puff}>{Array.from({ length: 10 }, (_, i) => <mesh key={i}><sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color="#D8CDB4" transparent roughness={1} /></mesh>)}</group>
      </group>
      <Actor player={me} x={-1.1} proud reaction={react('gain', 0.7)} />
    </>
  )
}

function Jail({ game, ev }: { game: Game; ev: Ev }) {
  const me = game.players.find(p => p.id === ev.actor)!
  const bars = useRef<THREE.Group>(null!)
  const t0 = useMemo(now, [])
  useFrame(() => {
    const t = now() - t0
    const u = clamp01(t / 0.35)
    bars.current.position.y = t < 0.35 ? 4 * (1 - u * u) : Math.abs(Math.sin((t - 0.35) * 14)) * 0.25 * Math.max(0, 1 - (t - 0.35) * 2.5)
  })
  return (
    <>
      <Actor player={me} x={0} low reaction={react('pay', 0.35)} />
      <group ref={bars} position={[0, 4, 1.1]}>
        {[-0.9, -0.45, 0, 0.45, 0.9].map(x => <mesh key={x} position={[x, 0, 0]}><cylinderGeometry args={[0.05, 0.05, 2.8, 12]} /><meshStandardMaterial color="#8E8E8E" metalness={0.9} roughness={0.35} /></mesh>)}
        {[1.35, -1.35].map(y => <mesh key={y} position={[0, y, 0]}><boxGeometry args={[2.1, 0.1, 0.1]} /><meshStandardMaterial color="#8E8E8E" metalness={0.9} roughness={0.35} /></mesh>)}
      </group>
    </>
  )
}

function Pact({ game, ev }: { game: Game; ev: Ev }) {
  const op = ev.entry.ops.find(o => o.op === 'pact')
  const pact = op && op.op === 'pact' ? op.pact : null
  const members = (pact?.members ?? []).slice(0, 3).map(id => game.players.find(p => p.id === id)!).filter(Boolean)
  const color = game.board.groups.find(g => g.id === pact?.groups[0])?.color ?? '#C9A24B'
  const { passed } = useBeat([0.9])
  const n = members.length
  return (
    <>
      {members.map((p, i) => {
        const spread = passed ? 0.95 : 2
        const x = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * spread
        return <Actor key={p.id} player={p} x={x} scale={n > 2 ? 0.75 : 0.9} sash={passed ? color : undefined} active={!passed} reaction={passed ? react('gain') : null} />
      })}
      {passed > 0 && <Confetti color={color} />}
    </>
  )
}

function Trade({ game, ev }: { game: Game; ev: Ev }) {
  const moves = ev.entry.ops.flatMap(o => (o.op === 'own' && o.owner ? [o] : []))
  const ids = [...new Set([ev.from, ev.to, ...moves.map(m => m.owner)].filter((p): p is string => !!p && p !== 'bank' && p !== 'pot'))].slice(0, 2)
  const [a, b] = ids.map(id => game.players.find(p => p.id === id)!)
  const cards = useRef<THREE.Group>(null!)
  const flights = useRef<Flight[]>([])
  const t0 = useMemo(now, [])
  const X = 1.5
  useEffect(() => {
    const at = now() + 0.3
    for (const o of ev.entry.ops) if (o.op === 'transfer' && o.from !== 'bank' && o.to !== 'bank') {
      const from = new THREE.Vector3(o.from === a?.id ? -X : X, 0.3, 0.4), to = new THREE.Vector3(o.to === a?.id ? -X : X, 0.3, 0.4)
      for (let c = 0; c < coinCount(o.amount); c++) flights.current.push({ from, to, t0: at + c * 0.07, dur: 0.9 })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => {
    const t = now() - t0
    cards.current.children.forEach((c, i) => {
      const toA = moves[i]?.owner === a?.id, u = ease((t - 0.3 - i * 0.15) / 1.1)
      c.position.set(THREE.MathUtils.lerp(toA ? X : -X, toA ? -X : X, u), 0.4 + Math.sin(u * Math.PI) * 1.2, 0.5 + i * 0.02)
      c.rotation.set(0, u * Math.PI * 2, 0)
    })
  })
  return (
    <>
      {a && <Actor player={a} x={-X} scale={0.8} reaction={react('gain', 1.3)} />}
      {b && <Actor player={b} x={X} scale={0.8} reaction={react('gain', 1.3)} />}
      <group ref={cards}>
        {moves.slice(0, 4).map(m => {
          const c = game.board.cells[m.cell]
          return <group key={m.cell} scale={0.55}><Deed band={game.board.groups.find(g => g.id === c.group)?.color ?? '#E8C872'} name={c.name} /></group>
        })}
      </group>
      <Coins flights={flights} />
    </>
  )
}

function Jackpot({ game, ev }: { game: Game; ev: Ev }) {
  const me = game.players.find(p => p.id === ev.actor)!
  const flights = useRef<Flight[]>([])
  useEffect(() => {
    const at = now() + 0.1, pot = new THREE.Vector3(0, -1.6, 1)
    for (let c = 0; c < 36; c++) {
      const top = new THREE.Vector3((Math.random() - 0.5) * 2.4, 0.6 + Math.random() * 0.6, 0.6)
      flights.current.push({ from: pot, to: top, t0: at + c * 0.05, dur: 0.9 })
    }
  }, [])
  return (
    <>
      <mesh position={[0, -1.7, 1]} material={BRASS}><cylinderGeometry args={[0.7, 0.55, 0.4, 32]} /></mesh>
      <Actor player={me} x={0} y={0.2} scale={0.75} proud reaction={react('gain', 0.4)} />
      <Coins flights={flights} />
    </>
  )
}

function Bankrupt({ game, ev }: { game: Game; ev: Ev }) {
  const me = game.players.find(p => p.id === ev.actor)!
  const moths = useRef<THREE.Group>(null!)
  const { t0, passed } = useBeat([1.5])
  useFrame(() => {
    const t = now() - t0
    moths.current.children.forEach((m, i) => {
      const u = clamp01((t - 0.4 - i * 0.12) / 1.6)
      m.position.set(0.4 * (i - 2) + Math.sin(u * 9 + i) * 0.4 * u, -0.5 + u * 3.5, 1)
      m.scale.setScalar(u > 0 && u < 1 ? 1 : 0.001)
      m.children.forEach((w, k) => { w.rotation.y = (k ? -1 : 1) * (0.3 + Math.abs(Math.sin(t * 22 + i)) * 1.1) })
    })
  })
  return (
    <>
      <Actor player={me} x={0} low={!passed} active={!!passed} reaction={passed ? null : react('pay', 0.1)} />
      {/* pockets turned out */}
      {[-1, 1].map(x => <mesh key={x} position={[x * 0.88, -0.62, 0.45]} rotation={[0, 0, x * -0.5]}><boxGeometry args={[0.3, 0.34, 0.08]} /><meshStandardMaterial color="#F3EBD8" roughness={0.9} /></mesh>)}
      <group ref={moths}>
        {Array.from({ length: 5 }, (_, i) => (
          <group key={i}>
            {[0, 1].map(k => <mesh key={k} position={[k ? 0.09 : -0.09, 0, 0]}><planeGeometry args={[0.18, 0.14]} /><meshStandardMaterial color="#9A9186" side={THREE.DoubleSide} /></mesh>)}
          </group>
        ))}
      </group>
    </>
  )
}

function Victory({ game, ev }: { game: Game; ev: Ev }) {
  const me = game.players.find(p => p.id === ev.actor)!
  return (
    <>
      <mesh position={[0, -1.55, 0]} material={BRASS}><boxGeometry args={[2, 0.5, 1.4]} /></mesh>
      <Actor player={me} x={0} y={-0.15} proud active reaction={react('gain', 0.3)} />
      <Confetti color="#E8C872" n={90} />
    </>
  )
}

/** Keeps a scene about `width` units wide in frame, whatever the screen's shape. */
export function Fit({ width, base }: { width: number; base: number }) {
  const { camera, size } = useThree()
  const aspect = size.width / Math.max(1, size.height)
  const d = Math.max(base, width / 2 / (Math.tan(((camera as THREE.PerspectiveCamera).fov / 2) * (Math.PI / 180)) * aspect))
  camera.position.set(0, 0.4 * (d / base), d)
  camera.lookAt(0, 0, 0)
  return null
}

export default function Scene({ game, ev }: { game: Game; ev: Ev }) {
  switch (ev.kind) {
    case 'buy': return <Buy game={game} ev={ev} />
    case 'hotel': return <Hotel game={game} ev={ev} />
    case 'jail': return <Jail game={game} ev={ev} />
    case 'pact': return <Pact game={game} ev={ev} />
    case 'trade': return <Trade game={game} ev={ev} />
    case 'jackpot': return <Jackpot game={game} ev={ev} />
    case 'bankrupt': return <Bankrupt game={game} ev={ev} />
    case 'victory': return <Victory game={game} ev={ev} />
    default: return null
  }
}
