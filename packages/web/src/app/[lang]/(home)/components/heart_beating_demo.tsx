// 'use client'

// import { a, type Groupable, type RafAniTimeline } from '@freestylejs/ani-core'
// import { useEffect, useRef } from 'react'

// // --- Constants ---
// const GRID_SIZE = 55
// const CELL_SIZE = 3
// const GAP = 3
// const TOTAL_SIZE = GRID_SIZE * (CELL_SIZE + GAP)

// // Heart Shape Math
// const isInsideHeart = (x: number, y: number) => {
//     const yy = -(y + 0.0)
//     const xx = x * 1
//     return Math.pow(xx * xx + yy * yy - 1, 3) - xx * xx * Math.pow(yy, 3) <= 0
// }

// // Define the shape of our animated object
// interface ParticleState {
//     // Static properties
//     x: number
//     y: number
//     // Animated properties
//     scale: number
//     opacity: number
//     translateY: number
//     rotate: number
// }

// export const HeartBeatingDemo = () => {
//     const canvasRef = useRef<HTMLCanvasElement>(null)

//     const timelinesRef = useRef<RafAniTimeline<Groupable>[]>([])
//     const particlesRef = useRef<ParticleState[]>([])

//     useEffect(() => {
//         const canvas = canvasRef.current
//         if (!canvas) return

//         const ctx = canvas.getContext('2d')
//         if (!ctx) return

//         const dpr = window.devicePixelRatio || 1
//         canvas.width = TOTAL_SIZE * dpr
//         canvas.height = TOTAL_SIZE * dpr
//         ctx.scale(dpr, dpr)

//         if (particlesRef.current.length === 0) {
//             const newParticles: ParticleState[] = []
//             const newTimelines: any[] = []

//             for (let row = 0; row < GRID_SIZE; row++) {
//                 for (let col = 0; col < GRID_SIZE; col++) {
//                     // Grid Math
//                     const x = (col / (GRID_SIZE - 1)) * 3 - 1.5
//                     const y = (row / (GRID_SIZE - 1)) * 3 - 1.5
//                     const adjustedY = y + 0.2

//                     if (isInsideHeart(x, adjustedY)) {
//                         const dist = Math.sqrt(x * x + adjustedY * adjustedY)

//                         // Calculate visual position
//                         const pixelX = col * (CELL_SIZE + GAP) + CELL_SIZE / 2
//                         const pixelY = row * (CELL_SIZE + GAP) + CELL_SIZE / 2

//                         // Create the State Object (The "Target")
//                         const particle: ParticleState = {
//                             x: pixelX,
//                             y: pixelY,
//                             // Initial values (matching your 'from' config)
//                             scale: 0.5,
//                             opacity: 0.3,
//                             translateY: 0,
//                             rotate: 0,
//                         }

//                         newParticles.push(particle)

//                         const delay = Math.sin(Math.sqrt(dist))
//                         const totalDuration = 1.75
//                         const activeDuration = 0.5
//                         const restDuration = Math.max(
//                             0,
//                             totalDuration - activeDuration - delay
//                         )

//                         const timeline = a.dynamicTimeline(
//                             a.parallel([
//                                 a.sequence([
//                                     a.delay(delay),
//                                     a.ani({
//                                         to: { scale: 2.15, opacity: 1 },
//                                         // duration: 0.15,
//                                         duration: Infinity,
//                                         timing: a.timing.dynamicSpring({
//                                             m: 1,
//                                             k: 200,
//                                             c: 2,
//                                         }),
//                                     }),
//                                     a.ani({
//                                         to: { scale: 1, opacity: 0.3 },
//                                         // duration: 0.45,
//                                         duration: Infinity,

//                                         timing: a.timing.dynamicSpring({
//                                             m: 1,
//                                             k: 200,
//                                             c: 2,
//                                         }),
//                                     }),
//                                     a.delay(restDuration),
//                                 ]),
//                                 a.sequence([
//                                     a.delay(delay),
//                                     a.ani({
//                                         to: { translateY: -15 },
//                                         // duration: 0.15,
//                                         duration: Infinity,

//                                         timing: a.timing.dynamicSpring({
//                                             m: 1,
//                                             k: 200,
//                                             c: 2,
//                                         }),
//                                     }),
//                                     a.ani({
//                                         to: { translateY: 0 },
//                                         // duration: 0.45,
//                                         duration: Infinity,
//                                     }),
//                                     a.delay(restDuration),
//                                 ]),
//                             ])
//                         )

//                         timeline.onUpdate(
//                             ({
//                                 state: { opacity, rotate, scale, translateY },
//                             }) => {
//                                 particle.opacity = opacity
//                                 particle.rotate = rotate
//                                 particle.scale = scale
//                                 particle.translateY = translateY
//                             }
//                         )

//                         timeline.play({
//                             from: {
//                                 opacity: 0.3,
//                                 scale: 1,
//                                 translateY: 0,
//                             },
//                             repeat: Infinity,
//                         })

//                         newTimelines.push(timeline)
//                     }
//                 }
//             }
//             particlesRef.current = newParticles
//             timelinesRef.current = newTimelines
//         }

//         let animationFrameId: number
//         const render = () => {
//             ctx.clearRect(0, 0, TOTAL_SIZE, TOTAL_SIZE)

//             const particles = particlesRef.current
//             for (const p of particles) {
//                 ctx.save()

//                 ctx.translate(p.x, p.y)

//                 ctx.translate(0, p.translateY)
//                 ctx.rotate((p.rotate * Math.PI) / 180)
//                 ctx.scale(p.scale, p.scale)

//                 ctx.globalAlpha = p.opacity
//                 ctx.fillStyle = 'oklch(63.7% 0.237 25.331)'
//                 ctx.beginPath()
//                 ctx.arc(0, 0, CELL_SIZE / 2, 0, Math.PI * 2)
//                 ctx.fill()

//                 ctx.restore()
//             }
//             animationFrameId = requestAnimationFrame(render)
//         }

//         render()

//         return () => {
//             cancelAnimationFrame(animationFrameId)
//             timelinesRef.current.forEach((tl) => tl.reset())
//         }
//     }, [])

//     return (
//         <div className="flex min-h-[400px] items-center justify-center">
//             <canvas
//                 ref={canvasRef}
//                 style={{
//                     width: TOTAL_SIZE,
//                     height: TOTAL_SIZE,
//                 }}
//             />
//         </div>
//     )
// }

///

// 'use client'

// import { a, type Groupable, type RafAniTimeline } from '@freestylejs/ani-core'
// import { useEffect, useRef } from 'react'

// const GRID_SIZE = 65
// const CELL_SIZE = 3
// const GAP = 3
// const TOTAL_SIZE = GRID_SIZE * (CELL_SIZE + GAP)

// const RIPPLE_SPEED = 0.2 // How fast the wave spreads
// const RIPPLE_FREQUENCY = 0.1 // Tightness of rings
// const RIPPLE_DECAY = 3000 // How long a ripple lasts (ms)
// const RIPPLE_AMPLITUDE = 20 // How "high" the splash pushes particles

// const isInsideHeart = (x: number, y: number) => {
//     const yy = -(y + 0.0)
//     const xx = x * 1
//     return Math.pow(xx * xx + yy * yy - 1, 3) - xx * xx * Math.pow(yy, 3) <= 0
// }

// interface ParticleState {
//     x: number
//     y: number
//     scale: number
//     opacity: number
//     translateY: number
//     rotate: number
// }

// interface Ripple {
//     x: number
//     y: number
//     startTime: number
// }

// export const HeartBeatingDemo = () => {
//     const canvasRef = useRef<HTMLCanvasElement>(null)
//     const timelinesRef = useRef<RafAniTimeline<Groupable>[]>([])
//     const particlesRef = useRef<ParticleState[]>([])

//     const ripplesRef = useRef<Ripple[]>([])
//     const lastRippleTime = useRef(0)

//     useEffect(() => {
//         const canvas = canvasRef.current
//         if (!canvas) return
//         const ctx = canvas.getContext('2d')
//         if (!ctx) return

//         const dpr = window.devicePixelRatio || 1
//         canvas.width = TOTAL_SIZE * dpr
//         canvas.height = TOTAL_SIZE * dpr
//         ctx.scale(dpr, dpr)

//         if (particlesRef.current.length === 0) {
//             const newParticles: ParticleState[] = []
//             const newTimelines: any[] = []

//             for (let row = 0; row < GRID_SIZE; row++) {
//                 for (let col = 0; col < GRID_SIZE; col++) {
//                     const x = (col / (GRID_SIZE - 1)) * 3 - 1.5
//                     const y = (row / (GRID_SIZE - 1)) * 3 - 1.5
//                     const adjustedY = y - 0.1

//                     if (isInsideHeart(x, adjustedY)) {
//                         const dist = Math.sqrt(x * x + adjustedY * adjustedY)
//                         const pixelX = col * (CELL_SIZE + GAP) + CELL_SIZE / 2
//                         const pixelY = row * (CELL_SIZE + GAP) + CELL_SIZE / 2

//                         const particle: ParticleState = {
//                             x: pixelX,
//                             y: pixelY,
//                             scale: 0.5,
//                             opacity: 0.3,
//                             translateY: 0,
//                             rotate: 0,
//                         }
//                         newParticles.push(particle)

//                         const delay = Math.sin(Math.sqrt(dist))
//                         const totalDuration = 1.75
//                         const activeDuration = 0.5
//                         const restDuration = Math.max(
//                             0,
//                             totalDuration - activeDuration - delay
//                         )

//                         const timeline = a.dynamicTimeline(
//                             a.parallel([
//                                 a.sequence([
//                                     a.delay(delay),
//                                     a.ani({
//                                         to: { scale: 2.15, opacity: 1 },
//                                         duration: Infinity,
//                                         timing: a.timing.dynamicSpring({
//                                             m: 1,
//                                             k: 200,
//                                             c: 2,
//                                         }),
//                                     }),
//                                     a.ani({
//                                         to: { scale: 1, opacity: 0.3 },
//                                         duration: Infinity,
//                                         timing: a.timing.dynamicSpring({
//                                             m: 1,
//                                             k: 200,
//                                             c: 2,
//                                         }),
//                                     }),
//                                     a.delay(restDuration),
//                                 ]),
//                                 a.sequence([
//                                     a.delay(delay),
//                                     a.ani({
//                                         to: { translateY: -15 },
//                                         duration: Infinity,
//                                         timing: a.timing.dynamicSpring({
//                                             m: 1,
//                                             k: 200,
//                                             c: 2,
//                                         }),
//                                     }),
//                                     a.ani({
//                                         to: { translateY: 0 },
//                                         duration: Infinity,
//                                     }),
//                                     a.delay(restDuration),
//                                 ]),
//                             ])
//                         )

//                         timeline.onUpdate(({ state }) => {
//                             Object.assign(particle, state)
//                         })

//                         timeline.play({
//                             from: { opacity: 0.3, scale: 1, translateY: 0 },
//                             repeat: Infinity,
//                         })
//                         newTimelines.push(timeline)
//                     }
//                 }
//             }
//             particlesRef.current = newParticles
//             timelinesRef.current = newTimelines
//         }

//         let animationFrameId: number
//         const render = () => {
//             ctx.clearRect(0, 0, TOTAL_SIZE, TOTAL_SIZE)

//             const now = performance.now()
//             const particles = particlesRef.current
//             const ripples = ripplesRef.current

//             for (let i = ripples.length - 1; i >= 0; i--) {
//                 if (now - ripples[i].startTime > RIPPLE_DECAY) {
//                     ripples.splice(i, 1)
//                 }
//             }

//             for (const p of particles) {
//                 let rippleOffsetScale = 0
//                 let rippleOffsetY = 0

//                 for (const r of ripples) {
//                     const dx = p.x - r.x
//                     const dy = p.y - r.y
//                     const dist = Math.sqrt(dx * dx + dy * dy)

//                     const t = now - r.startTime

//                     const waveRadius = t * RIPPLE_SPEED

//                     const distToWave = dist - waveRadius

//                     if (distToWave < 0 && distToWave > -80) {
//                         const fade = 1 - t / RIPPLE_DECAY

//                         const force =
//                             Math.cos(distToWave * RIPPLE_FREQUENCY) * fade

//                         rippleOffsetScale += force * 0.15
//                         rippleOffsetY += force * -RIPPLE_AMPLITUDE
//                     }
//                 }

//                 ctx.save()
//                 ctx.translate(p.x, p.y)

//                 ctx.translate(0, p.translateY + rippleOffsetY)
//                 ctx.rotate((p.rotate * Math.PI) / 180)

//                 const finalScale = Math.max(0.1, p.scale + rippleOffsetScale)
//                 ctx.scale(finalScale, finalScale)

//                 const energy = Math.min(1, Math.abs(rippleOffsetY) / 8)
//                 const lightness = 63 + energy * 20
//                 const hue = 25 - energy * 5

//                 ctx.globalAlpha = p.opacity
//                 ctx.fillStyle = `oklch(${lightness}% 0.27 ${hue})`
//                 ctx.beginPath()
//                 ctx.arc(0, 0, CELL_SIZE / 2, 0, Math.PI * 2)
//                 ctx.fill()

//                 ctx.restore()
//             }
//             animationFrameId = requestAnimationFrame(render)
//         }

//         render()

//         return () => {
//             cancelAnimationFrame(animationFrameId)
//             timelinesRef.current.forEach((tl) => tl.reset())
//         }
//     }, [])

//     const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
//         const now = performance.now()
//         const rect = e.currentTarget.getBoundingClientRect()
//         const x = (e.clientX - rect.left) * (TOTAL_SIZE / rect.width)
//         const y = (e.clientY - rect.top) * (TOTAL_SIZE / rect.height)

//         // Add a new ripple source
//         ripplesRef.current.push({
//             x,
//             y,
//             startTime: now,
//         })
//         lastRippleTime.current = now
//     }

//     return (
//         <div className="flex items-center justify-center bg-transparent">
//             <canvas
//                 ref={canvasRef}
//                 onPointerDown={handleMouseMove}
//                 style={{
//                     width: TOTAL_SIZE,
//                     height: TOTAL_SIZE,
//                     cursor: 'pointer', // Indicates interactivity
//                 }}
//             />
//         </div>
//     )
// }

// export const heartBeatingCode = `
// const GRID_SIZE = 19

// const Cell = ({ dist }: { dist: number }) => {
//     const ref = useRef<HTMLDivElement>(null)
//     const delay = dist * 0.2

//     useAni(
//         ref,
//         a.loop(
//             a.sequence([
//                 a.delay(delay),
//                 a.ani({
//                     to: {
//                         scale: 1,
//                         opacity: 1,
//                     },
//                     duration: 0.15,
//                     timing: a.timing.easeOut,
//                 }),
//                 a.ani({
//                     to: {
//                         scale: 0.3,
//                         opacity: 0.3,
//                     },
//                     duration: 0.45,
//                     timing: a.timing.easeIn,
//                 }),
//                 // Sync loop duration
//                 a.delay(Math.max(0, 1.5 - 0.6 - delay)),
//             ])
//         )
//     )

//     return (
//         <div
//             ref={ref}
//             className="size-2 rounded-full bg-red-900 opacity-30"
//             style={{ transform: 'scale(0.3)' }}
//         />
//     )
// }

// export const HeartBeatingDemo = () => {
//     // ... Grid generation logic (omitted for brevity)
//     // renders grid of Cells or placeholders based on heart formula
//     // (x^2 + y^2 - 1)^3 - x^2*y^3 <= 0
// }
// `

///

'use client'

import { a, type Groupable, type RafAniTimeline } from '@freestylejs/ani-core'
import { useEffect, useRef } from 'react'

const GRID_SIZE = 100
const CELL_SIZE = 2
const GAP = 2
const TOTAL_SIZE = GRID_SIZE * (CELL_SIZE + GAP)

const RIPPLE_SPEED = 0.25
const RIPPLE_FREQUENCY = 0.1
const RIPPLE_DECAY = 3000
const RIPPLE_AMPLITUDE = 15
const MAX_RIPPLES = 20 // Hard limit for WebGL uniform array

// --- Shaders ---

const VERTEX_SHADER = `
precision mediump float;

attribute vec2 a_position;
attribute vec4 a_animState; // x: scale, y: opacity, z: translateY, w: rotate

uniform vec2 u_resolution;
uniform float u_time;

// Ripple Uniforms
uniform vec3 u_ripples[${MAX_RIPPLES}]; // x, y, startTime
uniform int u_rippleCount;

varying vec4 v_color;
varying float v_opacity;

// Constants for simulation
const float RIPPLE_SPEED = ${RIPPLE_SPEED};
const float RIPPLE_DECAY = ${RIPPLE_DECAY}.0;
const float RIPPLE_FREQ = ${RIPPLE_FREQUENCY};
const float RIPPLE_AMP = ${RIPPLE_AMPLITUDE}.0;

// Simple Hue to RGB for the red spectrum
vec3 redGradient(float energy) {
    // Approximate the original OKLCH logic:
    // Low energy = Dark Red, High energy = Brighter/Pinker
    vec3 c1 = vec3(1.0, 0.05, 0.1); // Deep Red
    vec3 c2 = vec3(1.0, 0.4, 0.5);   // Bright Pink/Red
    return mix(c1, c2, clamp(energy, 0.0, 1.0));
}

void main() {
    vec2 pos = a_position;
    float baseScale = a_animState.x;
    float baseOpacity = a_animState.y;
    float baseTransY = a_animState.z;
    float rotateDeg = a_animState.w;

    float rippleOffsetScale = 0.0;
    float rippleOffsetY = 0.0;

    // GPU Ripple Logic
    for(int i = 0; i < ${MAX_RIPPLES}; i++) {
        if (i >= u_rippleCount) break;
        
        vec3 ripple = u_ripples[i];
        float dx = pos.x - ripple.x;
        float dy = pos.y - ripple.y;
        float dist = sqrt(dx * dx + dy * dy);
        
        float t = u_time - ripple.z; // u_time = now
        
        if (t > 0.0 && t < RIPPLE_DECAY) {
            float waveRadius = t * RIPPLE_SPEED;
            float distToWave = dist - waveRadius;
            
            // Logic: if (distToWave < 0 && distToWave > -80)
            if (distToWave < 0.0 && distToWave > -80.0) {
                float fade = 1.0 - (t / RIPPLE_DECAY);
                float force = cos(distToWave * RIPPLE_FREQ) * fade;
                
                rippleOffsetScale += force * 0.15;
                rippleOffsetY += force * -RIPPLE_AMP;
            }
        }
    }

    // Apply Transformations
    float totalY = pos.y + baseTransY + rippleOffsetY;
    float totalScale = max(0.1, baseScale + rippleOffsetScale);

    // Convert to Clip Space (-1.0 to 1.0)
    // 1. Normalize to 0..1
    vec2 zeroToOne = vec2(pos.x, totalY) / u_resolution;
    // 2. Convert to 0..2
    vec2 zeroToTwo = zeroToOne * 2.0;
    // 3. Convert to -1..1 (flip Y for webgl)
    vec2 clipSpace = zeroToTwo - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);

    // Point Size matches the cell size * scale
    gl_PointSize = ${CELL_SIZE.toFixed(1)} * totalScale * 2.0; // *2.0 for pixel density factor visual tweak

    // Color Calculation
    float energy = min(1.0, abs(rippleOffsetY) / 8.0);
    v_color = vec4(redGradient(energy), 1.0);
    v_opacity = baseOpacity;
}
`

const FRAGMENT_SHADER = `
precision mediump float;

varying vec4 v_color;
varying float v_opacity;

void main() {
    // Circular Point Sprite logic
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);

    // Smooth circle edge
    float alpha = 1.0 - smoothstep(0.45, 0.5, dist);
    
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(v_color.rgb, v_opacity * alpha);
}
`

const isInsideHeart = (x: number, y: number) => {
    const yy = -(y + 0.0)
    const xx = x * 1
    return Math.pow(xx * xx + yy * yy - 1, 3) - xx * xx * Math.pow(yy, 3) <= 0
}

interface ParticleState {
    x: number
    y: number
    scale: number
    opacity: number
    translateY: number
    rotate: number
}

interface Ripple {
    x: number
    y: number
    startTime: number
}

export const HeartBeatingDemo = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const timelinesRef = useRef<RafAniTimeline<Groupable>[]>([])

    // State refs
    const particlesRef = useRef<ParticleState[]>([])
    const ripplesRef = useRef<Ripple[]>([])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const gl = canvas.getContext('webgl', {
            alpha: true,
            premultipliedAlpha: false,
            antialias: false,
        })
        if (!gl) return

        // 1. Setup Canvas Size
        const dpr = window.devicePixelRatio || 1
        canvas.width = TOTAL_SIZE * dpr
        canvas.height = TOTAL_SIZE * dpr
        gl.viewport(0, 0, canvas.width, canvas.height)

        // Enable blending for transparency
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

        // 2. Compile Shaders
        const createShader = (type: number, source: string) => {
            const shader = gl.createShader(type)!
            gl.shaderSource(shader, source)
            gl.compileShader(shader)
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(shader))
                gl.deleteShader(shader)
                return null
            }
            return shader
        }

        const vert = createShader(gl.VERTEX_SHADER, VERTEX_SHADER)
        const frag = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
        if (!vert || !frag) return

        const program = gl.createProgram()!
        gl.attachShader(program, vert)
        gl.attachShader(program, frag)
        gl.linkProgram(program)
        gl.useProgram(program)

        // 3. Initialize Particles (Same logic as original)
        if (particlesRef.current.length === 0) {
            const newParticles: ParticleState[] = []
            const newTimelines: any[] = []

            for (let row = 0; row < GRID_SIZE; row++) {
                for (let col = 0; col < GRID_SIZE; col++) {
                    const x = (col / (GRID_SIZE - 1)) * 3 - 1.5
                    const y = (row / (GRID_SIZE - 1)) * 3 - 1.5
                    const adjustedY = y - 0.1

                    if (isInsideHeart(x, adjustedY)) {
                        const dist = Math.sqrt(x * x + adjustedY * adjustedY)
                        const pixelX = col * (CELL_SIZE + GAP) + CELL_SIZE / 2
                        const pixelY = row * (CELL_SIZE + GAP) + CELL_SIZE / 2

                        const particle: ParticleState = {
                            x: pixelX,
                            y: pixelY,
                            scale: 0.5,
                            opacity: 0.3,
                            translateY: 0,
                            rotate: 0,
                        }
                        newParticles.push(particle)

                        // --- Animation Logic (Preserved exactly) ---
                        const delay = Math.sin(Math.sqrt(dist))
                        const totalDuration = 1.75
                        const activeDuration = 0.5
                        const restDuration = Math.max(
                            0,
                            totalDuration - activeDuration - delay
                        )

                        const timeline = a.dynamicTimeline(
                            a.parallel([
                                a.sequence([
                                    a.delay(delay),
                                    a.ani({
                                        to: { scale: 2.15, opacity: 1 },
                                        duration: Infinity,
                                        timing: a.timing.dynamicSpring({
                                            m: 1,
                                            k: 200,
                                            c: 2,
                                        }),
                                    }),
                                    a.ani({
                                        to: { scale: 1, opacity: 0.3 },
                                        duration: Infinity,
                                        timing: a.timing.dynamicSpring({
                                            m: 1,
                                            k: 200,
                                            c: 2,
                                        }),
                                    }),
                                    a.delay(restDuration),
                                ]),
                                a.sequence([
                                    a.delay(delay),
                                    a.ani({
                                        to: { translateY: -15 },
                                        duration: Infinity,
                                        timing: a.timing.dynamicSpring({
                                            m: 1,
                                            k: 200,
                                            c: 2,
                                        }),
                                    }),
                                    a.ani({
                                        to: { translateY: 0 },
                                        duration: Infinity,
                                    }),
                                    a.delay(restDuration),
                                ]),
                            ])
                        )

                        timeline.onUpdate(({ state }) => {
                            Object.assign(particle, state)
                        })

                        timeline.play({
                            from: { opacity: 0.3, scale: 1, translateY: 0 },
                            repeat: Infinity,
                        })
                        newTimelines.push(timeline)
                    }
                }
            }
            particlesRef.current = newParticles
            timelinesRef.current = newTimelines
        }

        const particleCount = particlesRef.current.length

        // 4. Create Buffers

        // Static Position Buffer (x, y) - only uploaded once
        const posData = new Float32Array(particleCount * 2)
        particlesRef.current.forEach((p, i) => {
            posData[i * 2] = p.x
            posData[i * 2 + 1] = p.y
        })

        const positionBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, posData, gl.STATIC_DRAW)

        const aPosition = gl.getAttribLocation(program, 'a_position')
        gl.enableVertexAttribArray(aPosition)
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0)

        // Dynamic Animation Buffer (scale, opacity, translateY, rotate) - updated every frame
        const animData = new Float32Array(particleCount * 4)
        const animBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, animBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, animData, gl.DYNAMIC_DRAW) // DYNAMIC_DRAW for frequent updates

        const aAnimState = gl.getAttribLocation(program, 'a_animState')
        gl.enableVertexAttribArray(aAnimState)
        // Stride is 0 (tightly packed), offset 0
        gl.vertexAttribPointer(aAnimState, 4, gl.FLOAT, false, 0, 0)

        // Uniform Locations
        const uResolution = gl.getUniformLocation(program, 'u_resolution')
        const uTime = gl.getUniformLocation(program, 'u_time')
        const uRippleCount = gl.getUniformLocation(program, 'u_rippleCount')
        const uRipples = gl.getUniformLocation(program, 'u_ripples')

        // 5. Render Loop
        let animationFrameId: number
        const render = () => {
            const now = performance.now()

            // Cleanup old ripples
            for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
                if (now - ripplesRef.current[i].startTime > RIPPLE_DECAY) {
                    ripplesRef.current.splice(i, 1)
                }
            }

            // Prepare Ripple Data for Uniforms
            const ripples = ripplesRef.current
            const activeRippleCount = Math.min(ripples.length, MAX_RIPPLES)
            const rippleUniformData = new Float32Array(MAX_RIPPLES * 3) // Flattened vec3 array

            for (let i = 0; i < activeRippleCount; i++) {
                // [x, y, t]
                rippleUniformData[i * 3 + 0] = ripples[i].x
                rippleUniformData[i * 3 + 1] = ripples[i].y
                rippleUniformData[i * 3 + 2] = ripples[i].startTime
            }

            // Pack current animation state from JS objects to TypedArray
            // The timeline library updates the JS objects (particlesRef) automatically via onUpdate
            const particles = particlesRef.current
            for (let i = 0; i < particleCount; i++) {
                const p = particles[i]
                const offset = i * 4
                animData[offset + 0] = p.scale
                animData[offset + 1] = p.opacity
                animData[offset + 2] = p.translateY
                animData[offset + 3] = p.rotate
            }

            // Upload dynamic data to GPU
            gl.bindBuffer(gl.ARRAY_BUFFER, animBuffer)
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, animData)

            // Reset attrib pointer for safety if other buffers were bound (optional here but good practice)
            gl.vertexAttribPointer(aAnimState, 4, gl.FLOAT, false, 0, 0)

            // Update Uniforms
            gl.uniform2f(uResolution, TOTAL_SIZE, TOTAL_SIZE)
            gl.uniform1f(uTime, now)
            gl.uniform1i(uRippleCount, activeRippleCount)
            gl.uniform3fv(uRipples, rippleUniformData)

            // Draw
            gl.clearColor(0, 0, 0, 0)
            gl.clear(gl.COLOR_BUFFER_BIT)
            gl.drawArrays(gl.POINTS, 0, particleCount)

            animationFrameId = requestAnimationFrame(render)
        }

        render()

        return () => {
            cancelAnimationFrame(animationFrameId)
            timelinesRef.current.forEach((tl) => tl.reset())

            // WebGL Cleanup
            gl.deleteProgram(program)
            gl.deleteShader(vert)
            gl.deleteShader(frag)
            gl.deleteBuffer(positionBuffer)
            gl.deleteBuffer(animBuffer)
        }
    }, [])

    const handleInteraction = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const now = performance.now()
        const rect = e.currentTarget.getBoundingClientRect()
        const x = (e.clientX - rect.left) * (TOTAL_SIZE / rect.width)
        const y = (e.clientY - rect.top) * (TOTAL_SIZE / rect.height)

        // Add a new ripple source
        ripplesRef.current.push({
            x,
            y,
            startTime: now,
        })
    }

    return (
        <div className="flex items-center justify-center bg-transparent">
            <canvas
                ref={canvasRef}
                onPointerDown={handleInteraction}
                style={{
                    width: TOTAL_SIZE,
                    height: TOTAL_SIZE,
                    cursor: 'pointer',
                    touchAction: 'none',
                }}
            />
        </div>
    )
}

export const heartBeatingCode = `
// WebGL for high performance rendering

import { a, type Groupable, type RafAniTimeline } from '@freestylejs/ani-core'
import { useEffect, useRef } from 'react'

const GRID_SIZE = 100
const CELL_SIZE = 2
const GAP = 2
const TOTAL_SIZE = GRID_SIZE * (CELL_SIZE + GAP)

const RIPPLE_SPEED = 0.2
const RIPPLE_FREQUENCY = 0.1
const RIPPLE_DECAY = 3000
const RIPPLE_AMPLITUDE = 15
const MAX_RIPPLES = 20 // Hard limit for WebGL uniform array

const VERTEX_SHADER = \`
precision mediump float;

attribute vec2 a_position;
attribute vec4 a_animState; // x: scale, y: opacity, z: translateY, w: rotate

uniform vec2 u_resolution;
uniform float u_time;

// Ripple Uniforms
uniform vec3 u_ripples[\${MAX_RIPPLES}]; // x, y, startTime
uniform int u_rippleCount;

varying vec4 v_color;
varying float v_opacity;

// Constants for simulation
const float RIPPLE_SPEED = \${RIPPLE_SPEED};
const float RIPPLE_DECAY = \${RIPPLE_DECAY}.0;
const float RIPPLE_FREQ = \${RIPPLE_FREQUENCY};
const float RIPPLE_AMP = \${RIPPLE_AMPLITUDE}.0;

// Simple Hue to RGB for the red spectrum
vec3 redGradient(float energy) {
    // Approximate the original OKLCH logic:
    // Low energy = Dark Red, High energy = Brighter/Pinker
    vec3 c1 = vec3(1.0, 0.05, 0.1); // Deep Red
    vec3 c2 = vec3(1.0, 0.4, 0.5);   // Bright Pink/Red
    return mix(c1, c2, clamp(energy, 0.0, 1.0));
}

void main() {
    vec2 pos = a_position;
    float baseScale = a_animState.x;
    float baseOpacity = a_animState.y;
    float baseTransY = a_animState.z;
    float rotateDeg = a_animState.w;

    float rippleOffsetScale = 0.0;
    float rippleOffsetY = 0.0;

    // GPU Ripple Logic
    for(int i = 0; i < \${MAX_RIPPLES}; i++) {
        if (i >= u_rippleCount) break;
        
        vec3 ripple = u_ripples[i];
        float dx = pos.x - ripple.x;
        float dy = pos.y - ripple.y;
        float dist = sqrt(dx * dx + dy * dy);
        
        float t = u_time - ripple.z; // u_time = now
        
        if (t > 0.0 && t < RIPPLE_DECAY) {
            float waveRadius = t * RIPPLE_SPEED;
            float distToWave = dist - waveRadius;
            
            // Logic: if (distToWave < 0 && distToWave > -80)
            if (distToWave < 0.0 && distToWave > -80.0) {
                float fade = 1.0 - (t / RIPPLE_DECAY);
                float force = cos(distToWave * RIPPLE_FREQ) * fade;
                
                rippleOffsetScale += force * 0.15;
                rippleOffsetY += force * -RIPPLE_AMP;
            }
        }
    }

    // Apply Transformations
    float totalY = pos.y + baseTransY + rippleOffsetY;
    float totalScale = max(0.1, baseScale + rippleOffsetScale);

    // Convert to Clip Space (-1.0 to 1.0)
    // 1. Normalize to 0..1
    vec2 zeroToOne = vec2(pos.x, totalY) / u_resolution;
    // 2. Convert to 0..2
    vec2 zeroToTwo = zeroToOne * 2.0;
    // 3. Convert to -1..1 (flip Y for webgl)
    vec2 clipSpace = zeroToTwo - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);

    // Point Size matches the cell size * scale
    gl_PointSize = \${CELL_SIZE.toFixed(1)} * totalScale * 2.0; // *2.0 for pixel density factor visual tweak

    // Color Calculation
    float energy = min(1.0, abs(rippleOffsetY) / 8.0);
    v_color = vec4(redGradient(energy), 1.0);
    v_opacity = baseOpacity;
}
\`

const FRAGMENT_SHADER = \`
precision mediump float;

varying vec4 v_color;
varying float v_opacity;

void main() {
    // Circular Point Sprite logic
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);

    // Smooth circle edge
    float alpha = 1.0 - smoothstep(0.45, 0.5, dist);
    
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(v_color.rgb, v_opacity * alpha);
}
\`

const isInsideHeart = (x: number, y: number) => {
    const yy = -(y + 0.0)
    const xx = x * 1
    return Math.pow(xx * xx + yy * yy - 1, 3) - xx * xx * Math.pow(yy, 3) <= 0
}

interface ParticleState {
    x: number
    y: number
    scale: number
    opacity: number
    translateY: number
    rotate: number
}

interface Ripple {
    x: number
    y: number
    startTime: number
}

export const HeartBeatingDemo = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const timelinesRef = useRef<RafAniTimeline<Groupable>[]>([])

    // State refs
    const particlesRef = useRef<ParticleState[]>([])
    const ripplesRef = useRef<Ripple[]>([])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const gl = canvas.getContext('webgl', {
            alpha: true,
            premultipliedAlpha: false,
            antialias: false,
        })
        if (!gl) return

        // 1. Setup Canvas Size
        const dpr = window.devicePixelRatio || 1
        canvas.width = TOTAL_SIZE * dpr
        canvas.height = TOTAL_SIZE * dpr
        gl.viewport(0, 0, canvas.width, canvas.height)

        // Enable blending for transparency
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

        // 2. Compile Shaders
        const createShader = (type: number, source: string) => {
            const shader = gl.createShader(type)!
            gl.shaderSource(shader, source)
            gl.compileShader(shader)
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(shader))
                gl.deleteShader(shader)
                return null
            }
            return shader
        }

        const vert = createShader(gl.VERTEX_SHADER, VERTEX_SHADER)
        const frag = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
        if (!vert || !frag) return

        const program = gl.createProgram()!
        gl.attachShader(program, vert)
        gl.attachShader(program, frag)
        gl.linkProgram(program)
        gl.useProgram(program)

        // 3. Initialize Particles (Same logic as original)
        if (particlesRef.current.length === 0) {
            const newParticles: ParticleState[] = []
            const newTimelines: any[] = []

            for (let row = 0; row < GRID_SIZE; row++) {
                for (let col = 0; col < GRID_SIZE; col++) {
                    const x = (col / (GRID_SIZE - 1)) * 3 - 1.5
                    const y = (row / (GRID_SIZE - 1)) * 3 - 1.5
                    const adjustedY = y - 0.1

                    if (isInsideHeart(x, adjustedY)) {
                        const dist = Math.sqrt(x * x + adjustedY * adjustedY)
                        const pixelX = col * (CELL_SIZE + GAP) + CELL_SIZE / 2
                        const pixelY = row * (CELL_SIZE + GAP) + CELL_SIZE / 2

                        const particle: ParticleState = {
                            x: pixelX,
                            y: pixelY,
                            scale: 0.5,
                            opacity: 0.3,
                            translateY: 0,
                            rotate: 0,
                        }
                        newParticles.push(particle)

                        const delay = Math.sin(Math.sqrt(dist))
                        const totalDuration = 1.75
                        const activeDuration = 0.5
                        const restDuration = Math.max(
                            0,
                            totalDuration - activeDuration - delay
                        )

                        const timeline = a.dynamicTimeline(
                            a.parallel([
                                a.sequence([
                                    a.delay(delay),
                                    a.ani({
                                        to: { scale: 2.15, opacity: 1 },
                                        duration: Infinity,
                                        timing: a.timing.dynamicSpring({
                                            m: 1,
                                            k: 200,
                                            c: 2,
                                        }),
                                    }),
                                    a.ani({
                                        to: { scale: 1, opacity: 0.3 },
                                        duration: Infinity,
                                        timing: a.timing.dynamicSpring({
                                            m: 1,
                                            k: 200,
                                            c: 2,
                                        }),
                                    }),
                                    a.delay(restDuration),
                                ]),
                                a.sequence([
                                    a.delay(delay),
                                    a.ani({
                                        to: { translateY: -15 },
                                        duration: Infinity,
                                        timing: a.timing.dynamicSpring({
                                            m: 1,
                                            k: 200,
                                            c: 2,
                                        }),
                                    }),
                                    a.ani({
                                        to: { translateY: 0 },
                                        duration: Infinity,
                                    }),
                                    a.delay(restDuration),
                                ]),
                            ])
                        )

                        timeline.onUpdate(({ state }) => {
                            Object.assign(particle, state)
                        })

                        timeline.play({
                            from: { opacity: 0.3, scale: 1, translateY: 0 },
                            repeat: Infinity,
                        })
                        newTimelines.push(timeline)
                    }
                }
            }
            particlesRef.current = newParticles
            timelinesRef.current = newTimelines
        }

        const particleCount = particlesRef.current.length

        // 4. Create Buffers

        // Static Position Buffer (x, y) - only uploaded once
        const posData = new Float32Array(particleCount * 2)
        particlesRef.current.forEach((p, i) => {
            posData[i * 2] = p.x
            posData[i * 2 + 1] = p.y
        })

        const positionBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, posData, gl.STATIC_DRAW)

        const aPosition = gl.getAttribLocation(program, 'a_position')
        gl.enableVertexAttribArray(aPosition)
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0)

        // Dynamic Animation Buffer (scale, opacity, translateY, rotate) - updated every frame
        const animData = new Float32Array(particleCount * 4)
        const animBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, animBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, animData, gl.DYNAMIC_DRAW) // DYNAMIC_DRAW for frequent updates

        const aAnimState = gl.getAttribLocation(program, 'a_animState')
        gl.enableVertexAttribArray(aAnimState)
        // Stride is 0 (tightly packed), offset 0
        gl.vertexAttribPointer(aAnimState, 4, gl.FLOAT, false, 0, 0)

        // Uniform Locations
        const uResolution = gl.getUniformLocation(program, 'u_resolution')
        const uTime = gl.getUniformLocation(program, 'u_time')
        const uRippleCount = gl.getUniformLocation(program, 'u_rippleCount')
        const uRipples = gl.getUniformLocation(program, 'u_ripples')

        // 5. Render Loop
        let animationFrameId: number
        const render = () => {
            const now = performance.now()

            // Cleanup old ripples
            for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
                if (now - ripplesRef.current[i].startTime > RIPPLE_DECAY) {
                    ripplesRef.current.splice(i, 1)
                }
            }

            // Prepare Ripple Data for Uniforms
            const ripples = ripplesRef.current
            const activeRippleCount = Math.min(ripples.length, MAX_RIPPLES)
            const rippleUniformData = new Float32Array(MAX_RIPPLES * 3) // Flattened vec3 array

            for (let i = 0; i < activeRippleCount; i++) {
                // [x, y, t]
                rippleUniformData[i * 3 + 0] = ripples[i].x
                rippleUniformData[i * 3 + 1] = ripples[i].y
                rippleUniformData[i * 3 + 2] = ripples[i].startTime
            }

            // Pack current animation state from JS objects to TypedArray
            // The timeline library updates the JS objects (particlesRef) automatically via onUpdate
            const particles = particlesRef.current
            for (let i = 0; i < particleCount; i++) {
                const p = particles[i]
                const offset = i * 4
                animData[offset + 0] = p.scale
                animData[offset + 1] = p.opacity
                animData[offset + 2] = p.translateY
                animData[offset + 3] = p.rotate
            }

            // Upload dynamic data to GPU
            gl.bindBuffer(gl.ARRAY_BUFFER, animBuffer)
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, animData)

            // Reset attrib pointer for safety if other buffers were bound (optional here but good practice)
            gl.vertexAttribPointer(aAnimState, 4, gl.FLOAT, false, 0, 0)

            // Update Uniforms
            gl.uniform2f(uResolution, TOTAL_SIZE, TOTAL_SIZE)
            gl.uniform1f(uTime, now)
            gl.uniform1i(uRippleCount, activeRippleCount)
            gl.uniform3fv(uRipples, rippleUniformData)

            // Draw
            gl.clearColor(0, 0, 0, 0)
            gl.clear(gl.COLOR_BUFFER_BIT)
            gl.drawArrays(gl.POINTS, 0, particleCount)

            animationFrameId = requestAnimationFrame(render)
        }

        render()

        return () => {
            cancelAnimationFrame(animationFrameId)
            timelinesRef.current.forEach((tl) => tl.reset())

            // WebGL Cleanup
            gl.deleteProgram(program)
            gl.deleteShader(vert)
            gl.deleteShader(frag)
            gl.deleteBuffer(positionBuffer)
            gl.deleteBuffer(animBuffer)
        }
    }, [])

    const handleInteraction = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const now = performance.now()
        const rect = e.currentTarget.getBoundingClientRect()
        const x = (e.clientX - rect.left) * (TOTAL_SIZE / rect.width)
        const y = (e.clientY - rect.top) * (TOTAL_SIZE / rect.height)

        // Add a new ripple source
        ripplesRef.current.push({
            x,
            y,
            startTime: now,
        })
    }

    return (
        <div className="flex items-center justify-center bg-transparent">
            <canvas
                ref={canvasRef}
                onPointerDown={handleInteraction}
                style={{
                    width: TOTAL_SIZE,
                    height: TOTAL_SIZE,
                    cursor: 'pointer',
                    touchAction: 'none',
                }}
            />
        </div>
    )
}
`
