import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Player } from '../engine/types.ts'

// Shared geometry: every creature is built from the same handful of primitives.
const G = {
  body: new THREE.SphereGeometry(1, 48, 36),
  ball: new THREE.SphereGeometry(1, 20, 14),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 32),
  smile: new THREE.TorusGeometry(0.2, 0.045, 10, 28, Math.PI),
  ooh: new THREE.TorusGeometry(0.1, 0.045, 10, 24),
  ring: new THREE.TorusGeometry(1, 0.06, 10, 48),
  cone: new THREE.ConeGeometry(1, 1, 24),
  capsule: new THREE.CapsuleGeometry(0.09, 0.28, 6, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
}

const M = {
  white: new THREE.MeshStandardMaterial({ color: '#FFFDF6', roughness: 0.35 }),
  pupil: new THREE.MeshStandardMaterial({ color: '#141312', roughness: 0.2 }),
  mouth: new THREE.MeshStandardMaterial({ color: '#2A1414', roughness: 0.6 }),
  blush: new THREE.MeshStandardMaterial({ color: '#FF8FA3', roughness: 0.9, transparent: true, opacity: 0.55 }),
  brass: new THREE.MeshStandardMaterial({ color: '#C9A24B', metalness: 1, roughness: 0.3 }),
  black: new THREE.MeshStandardMaterial({ color: '#1B1A17', roughness: 0.55 }),
  felt: new THREE.MeshStandardMaterial({ color: '#7A1F2B', roughness: 0.85 }),
  tweed: new THREE.MeshStandardMaterial({ color: '#6B5236', roughness: 0.95 }),
  pearl: new THREE.MeshPhysicalMaterial({ color: '#F6F0E4', roughness: 0.15, clearcoat: 1, sheen: 1 }),
  feather: new THREE.MeshStandardMaterial({ color: '#F3EBD8', roughness: 0.9 }),
  sweat: new THREE.MeshPhysicalMaterial({ color: '#9FD3FF', roughness: 0.05, transmission: 0.3, transparent: true, opacity: 0.85 }),
  bars: new THREE.MeshStandardMaterial({ color: '#8E8E8E', metalness: 0.9, roughness: 0.35 }),
}

export type Reaction = { kind: 'gain' | 'pay'; at: number } | null

export type CreatureProps = {
  player: Player
  target: [number, number, number]
  scale: number
  active: boolean
  jailed: boolean
  bankrupt: boolean
  low: boolean
  proud: boolean
  reaction: Reaction
  reduced: boolean
}

const damp = THREE.MathUtils.damp
const GREY = new THREE.Color('#8A8A86')

function Accessory({ kind }: { kind: number }) {
  switch (kind) {
    case 0: return ( // top hat
      <group position={[0, 0.98, 0]} rotation={[0, 0, -0.12]}>
        <mesh geometry={G.cyl} material={M.black} scale={[0.62, 0.05, 0.62]} />
        <mesh geometry={G.cyl} material={M.black} position={[0, 0.34, 0]} scale={[0.4, 0.66, 0.4]} />
        <mesh geometry={G.cyl} material={M.brass} position={[0, 0.1, 0]} scale={[0.41, 0.1, 0.41]} />
      </group>
    )
    case 1: return ( // monocle
      <group position={[0.33, 0.26, 0.9]}>
        <mesh geometry={G.ring} material={M.brass} scale={0.25} />
        <mesh geometry={G.cyl} material={M.brass} position={[0.2, -0.35, -0.05]} rotation={[0, 0, 0.5]} scale={[0.012, 0.6, 0.012]} />
      </group>
    )
    case 2: return ( // cloche
      <group position={[0, 0.55, 0]} rotation={[0.15, 0, 0.1]}>
        <mesh geometry={G.body} material={M.felt} scale={[0.86, 0.62, 0.86]} position={[0, 0.12, -0.05]} />
        <mesh geometry={G.ring} material={M.brass} rotation={[Math.PI / 2, 0, 0]} scale={[0.84, 0.84, 0.5]} position={[0, 0.02, -0.02]} />
      </group>
    )
    case 3: return ( // bowler
      <group position={[0, 0.9, 0]} rotation={[0, 0, 0.1]}>
        <mesh geometry={G.cyl} material={M.black} scale={[0.66, 0.04, 0.66]} />
        <mesh geometry={G.body} material={M.black} position={[0, 0.08, 0]} scale={[0.44, 0.36, 0.44]} />
      </group>
    )
    case 4: return ( // newsboy cap
      <group position={[0, 0.84, 0]} rotation={[0.12, 0, 0]}>
        <mesh geometry={G.body} material={M.tweed} scale={[0.7, 0.26, 0.74]} />
        <mesh geometry={G.box} material={M.tweed} position={[0, -0.06, 0.62]} rotation={[0.25, 0, 0]} scale={[0.66, 0.04, 0.34]} />
        <mesh geometry={G.ball} material={M.tweed} position={[0, 0.24, 0]} scale={0.07} />
      </group>
    )
    case 5: return ( // flapper band with feather
      <group position={[0, 0.58, 0]}>
        <mesh geometry={G.ring} material={M.brass} rotation={[Math.PI / 2, 0, 0]} scale={0.83} />
        <mesh geometry={G.ball} material={M.feather} position={[0.42, 0.55, 0.4]} rotation={[0.3, 0, -0.5]} scale={[0.09, 0.5, 0.05]} />
        <mesh geometry={G.ball} material={M.brass} position={[0.4, 0.14, 0.62]} scale={0.09} />
      </group>
    )
    case 6: return ( // pearls
      <group position={[0, -0.38, 0]}>
        {Array.from({ length: 14 }, (_, i) => {
          const a = Math.PI * 0.15 + (i / 13) * Math.PI * 0.7
          return <mesh key={i} geometry={G.ball} material={M.pearl} position={[Math.cos(a) * 0.9, -Math.sin(a) * 0.12, Math.sin(a) * 0.6]} scale={0.075} />
        })}
      </group>
    )
    default: return ( // bow tie
      <group position={[0, -0.45, 0.86]} rotation={[-0.3, 0, 0]}>
        <mesh geometry={G.cone} material={M.felt} position={[-0.16, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.14, 0.26, 0.14]} />
        <mesh geometry={G.cone} material={M.felt} position={[0.16, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[0.14, 0.26, 0.14]} />
        <mesh geometry={G.ball} material={M.brass} scale={0.07} />
      </group>
    )
  }
}

export default function Creature(p: CreatureProps) {
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const eyes = useRef<THREE.Group>(null!)
  const pupils = useRef<THREE.Group>(null!)
  const arm = useRef<THREE.Group>(null!)
  const smile = useRef<THREE.Mesh>(null!)
  const frown = useRef<THREE.Mesh>(null!)
  const ooh = useRef<THREE.Mesh>(null!)
  const sweat = useRef<THREE.Mesh>(null!)
  const bars = useRef<THREE.Group>(null!)

  const skin = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: p.player.color, roughness: 0.55, sheen: 1, sheenRoughness: 0.4,
    sheenColor: new THREE.Color(p.player.color).lerp(new THREE.Color('#ffffff'), 0.5), clearcoat: 0.15,
  }), [p.player.color])
  const feet = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color(p.player.color).multiplyScalar(0.55), roughness: 0.7 }), [p.player.color])
  const base = useMemo(() => new THREE.Color(p.player.color), [p.player.color])
  const phase = (p.player.seed % 1000) / 159

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime + phase
    const now = performance.now() / 1000
    const lam = p.reduced ? 1e3 : 8
    const age = p.reaction ? now - p.reaction.at : 99

    // where it stands: the active creature steps into the spotlight
    const g = root.current
    g.position.x = damp(g.position.x, p.target[0], lam, dt)
    g.position.y = damp(g.position.y, p.target[1], lam, dt)
    g.position.z = damp(g.position.z, p.target[2] + (p.active ? 0.9 : 0), lam * 0.6, dt)
    const s = p.scale * (p.bankrupt ? 0.85 : 1)
    g.scale.setScalar(damp(g.scale.x, s, lam, dt))

    // body: breathing, hops when paid, squash when paying, jitter when broke
    let hop = 0, sy = 1, sx = 1
    if (!p.reduced) {
      sy += Math.sin(t * 2.1) * 0.025
      if (p.reaction?.kind === 'gain' && age < 1.1) hop = Math.abs(Math.sin((age / 1.1) * Math.PI * 2)) * 0.55 * (1 - age / 1.1)
      if (p.reaction?.kind === 'pay' && age < 0.9) { const k = Math.sin((age / 0.9) * Math.PI); sy -= 0.22 * k; sx += 0.14 * k }
      if (p.proud) sy += 0.04
    }
    if (p.bankrupt) { sy = 0.62; sx = 1.12 }
    const b = body.current
    b.position.y = damp(b.position.y, hop, 18, dt)
    b.scale.set(damp(b.scale.x, sx, 14, dt), damp(b.scale.y, sy, 14, dt), damp(b.scale.z, sx, 14, dt))
    b.rotation.z = p.low && !p.bankrupt && !p.reduced ? Math.sin(t * 23) * 0.03 : damp(b.rotation.z, p.bankrupt ? 0.25 : 0, 6, dt)
    b.rotation.x = damp(b.rotation.x, p.proud ? -0.12 : p.bankrupt ? 0.3 : 0, 6, dt)
    skin.color.copy(base).lerp(GREY, p.bankrupt ? 0.8 : 0)

    // eyes: blink, dart when broke, closed when bankrupt
    const blink = !p.reduced && (t % 4.3) < 0.12
    eyes.current.scale.y = damp(eyes.current.scale.y, p.bankrupt ? 0.12 : blink ? 0.1 : 1, 30, dt)
    pupils.current.position.x = p.low && !p.reduced ? Math.sin(t * 7) * 0.05 : 0

    // mouth mood
    const mood = p.bankrupt ? 'frown' : p.reaction?.kind === 'pay' && age < 2 ? 'ooh' : p.low ? 'frown' : 'smile'
    const grin = p.reaction?.kind === 'gain' && age < 2 ? 1.35 : 1
    smile.current.scale.setScalar(damp(smile.current.scale.x, mood === 'smile' ? grin : 0.001, 14, dt))
    frown.current.scale.setScalar(damp(frown.current.scale.x, mood === 'frown' ? 1 : 0.001, 14, dt))
    ooh.current.scale.setScalar(damp(ooh.current.scale.x, mood === 'ooh' ? 1 : 0.001, 14, dt))

    // the active creature waves
    arm.current.rotation.z = damp(arm.current.rotation.z, p.active && !p.bankrupt ? 2.5 + (p.reduced ? 0 : Math.sin(t * 7) * 0.4) : 0.35, 8, dt)

    // a sweat drop slides down while paying
    const sw = sweat.current
    sw.visible = p.reaction?.kind === 'pay' && age < 1.4 && !p.reduced
    sw.position.y = 0.75 - Math.min(age, 1.4) * 0.35

    bars.current.visible = p.jailed
  })

  return (
    <group ref={root} position={p.target}>
      <mesh geometry={G.cyl} material={M.brass} position={[0, -1.12, 0]} scale={[0.95, 0.22, 0.95]} />
      <mesh geometry={G.cyl} material={M.brass} position={[0, -1.28, 0]} scale={[1.08, 0.1, 1.08]} />
      <group ref={body}>
        <group position={[0, 0, 0]}>
          <mesh geometry={G.body} material={skin} scale={[1, 1.06, 0.95]} castShadow />
          <mesh geometry={G.ball} material={feet} position={[-0.38, -0.95, 0.25]} scale={[0.26, 0.13, 0.34]} />
          <mesh geometry={G.ball} material={feet} position={[0.38, -0.95, 0.25]} scale={[0.26, 0.13, 0.34]} />
          <group position={[-0.9, 0.08, 0.05]} rotation={[0, 0, -0.35]}>
            <mesh geometry={G.capsule} material={skin} position={[0, -0.22, 0]} />
          </group>
          <group ref={arm} position={[0.9, 0.08, 0.05]} rotation={[0, 0, 0.35]}>
            <mesh geometry={G.capsule} material={skin} position={[0, -0.22, 0]} />
          </group>
          <group ref={eyes} position={[0, 0.26, 0.8]}>
            <mesh geometry={G.ball} material={M.white} position={[-0.3, 0, 0]} scale={[0.2, 0.24, 0.12]} />
            <mesh geometry={G.ball} material={M.white} position={[0.3, 0, 0]} scale={[0.2, 0.24, 0.12]} />
            <group ref={pupils}>
              <mesh geometry={G.ball} material={M.pupil} position={[-0.29, -0.02, 0.1]} scale={0.11} />
              <mesh geometry={G.ball} material={M.pupil} position={[0.31, -0.02, 0.1]} scale={0.11} />
              <mesh geometry={G.ball} material={M.white} position={[-0.25, 0.04, 0.19]} scale={0.035} />
              <mesh geometry={G.ball} material={M.white} position={[0.35, 0.04, 0.19]} scale={0.035} />
            </group>
          </group>
          <mesh geometry={G.ball} material={M.blush} position={[-0.55, -0.02, 0.74]} scale={[0.14, 0.08, 0.05]} />
          <mesh geometry={G.ball} material={M.blush} position={[0.55, -0.02, 0.74]} scale={[0.14, 0.08, 0.05]} />
          <group position={[0, -0.12, 0.93]}>
            <mesh ref={smile} geometry={G.smile} material={M.mouth} rotation={[0, 0, Math.PI]} />
            <mesh ref={frown} geometry={G.smile} material={M.mouth} position={[0, -0.14, -0.02]} scale={0.001} />
            <mesh ref={ooh} geometry={G.ooh} material={M.mouth} scale={0.001} />
          </group>
          <mesh ref={sweat} geometry={G.ball} material={M.sweat} position={[0.7, 0.75, 0.55]} scale={[0.07, 0.11, 0.07]} visible={false} />
          <Accessory kind={p.player.accessory} />
        </group>
      </group>
      <group ref={bars} position={[0, -0.1, 1.15]} visible={false}>
        {[-0.75, -0.25, 0.25, 0.75].map(x => <mesh key={x} geometry={G.cyl} material={M.bars} position={[x, 0, 0]} scale={[0.035, 2.2, 0.035]} />)}
        <mesh geometry={G.box} material={M.bars} position={[0, 1.08, 0]} scale={[1.8, 0.07, 0.07]} />
        <mesh geometry={G.box} material={M.bars} position={[0, -1.08, 0]} scale={[1.8, 0.07, 0.07]} />
      </group>
    </group>
  )
}
