import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { StageLights, useDarkTheme } from './Stage.tsx'

/**
 * A polished brass tube that snakes in from the left, coils round the How to use button like a solenoid, unwinds and
 * leaves to the right, with a glowing arrowhead that carries its own light and sheds sparks.
 * The canvas lies over the page; an invisible stand-in for the button writes depth, so the half of every turn that
 * passes behind the button is hidden and the real button shows through. World units are CSS pixels at z = 0.
 */

type Layout = { w: number; cy: number; bx: number; bw: number; bh: number }
const BAND = 300 // canvas height in px, centred on the button
const FOV = 30
const TUBE = 7
const TURN_SEGS = 48
const SPARKS = 160

const ease = (u: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(255,248,220,1)')
  r.addColorStop(0.25, 'rgba(255,214,120,0.8)')
  r.addColorStop(1, 'rgba(255,170,40,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function Wire({ w, bx, bw, bh }: Layout) {
  const invalidate = useThree(s => s.invalidate)
  const dpr = useThree(s => s.viewport.dpr)
  const head = useRef<THREE.Group>(null!)
  const tailCap = useRef<THREE.Mesh>(null!)
  const glow = useRef<THREE.Sprite>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const glowMap = useMemo(glowTexture, [])

  // the path: straight in at the top of the coil, a slanted helix round the button's long axis, straight out
  const { curve, geo, segs, tail } = useMemo(() => {
    const R = bh / 2 + 15
    const xa = bx - bw / 2 - 18, xb = bx + bw / 2 + 18
    const turns = Math.max(3, Math.round((xb - xa) / 44)), pitch = (xb - xa) / turns
    const pts: THREE.Vector3[] = []
    for (let x = -w / 2 - 80; x < xa; x += 40) pts.push(new THREE.Vector3(x, R, 0))
    for (let i = 0; i <= turns * TURN_SEGS; i++) {
      const t = (i / TURN_SEGS) * Math.PI * 2
      pts.push(new THREE.Vector3(xa + (pitch * t) / (Math.PI * 2) + 0.33 * R * Math.sin(t), R * Math.cos(t), R * Math.sin(t)))
    }
    for (let x = xb + 40; x < w / 2 + 120; x += 40) pts.push(new THREE.Vector3(x, R, 0))
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    const segs = 1200
    const geo = new THREE.TubeGeometry(curve, segs, TUBE, 16, false)
    const lengths = curve.getLengths(segs), total = lengths.at(-1)!
    // the visible body is long enough to wrap every turn at once, then slides off to the right
    const helix = Math.PI * 2 * R * turns * 1.08
    return { curve, geo, segs, tail: helix / total + 0.06 }
  }, [w, bx, bw, bh])
  useEffect(() => () => geo.dispose(), [geo])

  const brass = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#F0C766', metalness: 0.9, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.8,
    emissive: '#5A3A08', emissiveIntensity: 0.35, // keeps the shaded underside warm brass instead of black
  }), [])
  const tip = useMemo(() => new THREE.MeshStandardMaterial({ color: '#FFE39A', emissive: '#FFB43A', emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.25 }), [])

  // sparks shed by the arrowhead: position, velocity and age per particle. They fade by alpha: on a transparent
  // canvas a colour fading to black would still paint an opaque dark dot over the page
  const sparks = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPARKS * 4), 4))
    return { g, vel: new Float32Array(SPARKS * 3), age: new Float32Array(SPARKS).fill(9), next: 0 }
  }, [])
  const sparkMat = useMemo(() => new THREE.PointsMaterial({
    size: 11 * dpr, map: glowMap, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: false,
  }), [glowMap, dpr])

  const clock = useRef({ t0: performance.now() / 1000 + 1, wake: 0 })
  useFrame((_, dt) => {
    const now = performance.now() / 1000, travel = 3.4, pause = 2.6
    let t = now - clock.current.t0
    if (t > travel + pause) { clock.current.t0 = now; t = 0 }
    const u = ease(t / travel) * (1 + tail)
    const a = Math.min(1, Math.max(0, u - tail)), b = Math.min(1, Math.max(0, u))
    const s0 = Math.floor(a * segs), s1 = Math.floor(b * segs)
    geo.setDrawRange(s0 * 16 * 6, Math.max(0, s1 - s0) * 16 * 6)
    const live = s1 > s0 && b < 1

    // the arrowhead rides the tip and points along the tube
    const p = curve.getPointAt(b), dir = curve.getTangentAt(b)
    head.current.visible = glow.current.visible = live
    head.current.position.copy(p)
    head.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    glow.current.position.copy(p)
    const pulse = 1 + Math.sin(now * 14) * 0.12
    glow.current.scale.setScalar(96 * pulse)
    light.current.position.copy(p).add(new THREE.Vector3(0, 0, 30))
    light.current.intensity = live ? 6 : 0
    tailCap.current.visible = s1 > s0
    tailCap.current.position.copy(curve.getPointAt(a))

    // sparks
    const pos = sparks.g.attributes.position.array as Float32Array, col = sparks.g.attributes.color.array as Float32Array
    if (live) for (let n = 0; n < 3; n++) {
      const i = sparks.next = (sparks.next + 1) % SPARKS
      pos.set([p.x, p.y, p.z], i * 3)
      sparks.vel.set([-dir.x * 60 + (Math.random() - 0.5) * 120, -dir.y * 60 + (Math.random() - 0.5) * 120 + 30, (Math.random() - 0.5) * 80], i * 3)
      sparks.age[i] = 0
    }
    let alive = false
    for (let i = 0; i < SPARKS; i++) {
      const age = (sparks.age[i] += dt), k = Math.max(0, 1 - age / 0.9)
      if (k > 0) alive = true
      for (let j = 0; j < 3; j++) pos[i * 3 + j] += sparks.vel[i * 3 + j] * dt
      sparks.vel[i * 3 + 1] -= 160 * dt // a little gravity
      col.set([1, 0.82, 0.45, k], i * 4)
    }
    sparks.g.attributes.position.needsUpdate = true
    sparks.g.attributes.color.needsUpdate = true

    // render only while something moves; otherwise sleep until the next pass
    if (t < travel || alive) invalidate() // the whole pass, including its first frames when the tube is still empty
    else {
      clearTimeout(clock.current.wake)
      clock.current.wake = window.setTimeout(invalidate, Math.max(0, (travel + pause - t) * 1000))
    }
  })
  useEffect(() => () => clearTimeout(clock.current.wake), [])

  return (
    <>
      {/* the button's stand-in: writes depth only, so turns behind it disappear and the real button shows */}
      <RoundedBox args={[bw, bh, 2]} radius={Math.min(12, bh / 2 - 1)} position={[bx, 0, 0]} renderOrder={-1}>
        <meshBasicMaterial colorWrite={false} />
      </RoundedBox>
      <mesh geometry={geo} material={brass} />
      <mesh ref={tailCap} material={brass}><sphereGeometry args={[TUBE, 16, 12]} /></mesh>
      <group ref={head}>
        <mesh material={tip} position={[0, 13, 0]}><coneGeometry args={[15, 34, 24]} /></mesh>
        <mesh material={tip}><sphereGeometry args={[TUBE + 0.5, 16, 12]} /></mesh>
      </group>
      <sprite ref={glow}><spriteMaterial map={glowMap} blending={THREE.AdditiveBlending} depthWrite={false} transparent /></sprite>
      <pointLight ref={light} color="#FFD27A" distance={260} decay={0} />
      <points geometry={sparks.g} material={sparkMat} frustumCulled={false} />
    </>
  )
}

export default function Coil({ target }: { target: RefObject<HTMLElement | null> }) {
  const dark = useDarkTheme()
  const [box, setBox] = useState<Layout | null>(null)
  useEffect(() => {
    const btn = target.current, stage = btn?.closest<HTMLElement>('.lobby')
    if (!btn || !stage) return
    const measure = () => {
      const L = stage.getBoundingClientRect(), r = btn.getBoundingClientRect()
      setBox({ w: stage.clientWidth, cy: r.top - L.top + r.height / 2, bx: r.left - L.left + r.width / 2 - stage.clientWidth / 2, bw: r.width, bh: r.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(stage); ro.observe(btn)
    return () => ro.disconnect()
  }, [target])
  if (!box) return null
  const z = BAND / 2 / Math.tan(((FOV / 2) * Math.PI) / 180) // puts z = 0 at one world unit per CSS pixel
  return (
    <div className="coil3d" style={{ top: box.cy - BAND / 2, height: BAND }} aria-hidden="true">
      {/* R3F turns pointer events back on for its own wrapper; the coil must never catch a tap meant for the page */}
      <Canvas style={{ pointerEvents: 'none' }} dpr={[1, 2]} frameloop="demand" gl={{ alpha: true, antialias: true }}
        camera={{ fov: FOV, position: [0, 0, z], near: 10, far: z * 3 }}>
        <StageLights dark={dark} />
        <Wire {...box} />
      </Canvas>
    </div>
  )
}
