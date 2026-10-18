import type { CoreApi, Values } from './core_api.ts'
import type { Rng } from './rng.ts'

// Everything the runner generates is plain data: node trees, subjects and
// operations are JSON, so a failing run replays from its op list alone.

export type TimingSpec =
    | { t: 'linear' }
    | {
          t: 'bezier'
          p2: { x: number; y: number }
          p3: { x: number; y: number }
      }
    | { t: 'spring'; m: number; k: number; c: number }

export type NodeSpec =
    | { t: 'ani'; to: Values; duration: number; timing: TimingSpec }
    | { t: 'delay'; duration: number }
    | { t: 'sequence' | 'parallel'; children: NodeSpec[] }
    | { t: 'stagger'; offset: number; children: NodeSpec[] }
    | { t: 'loop'; count: number; child: NodeSpec }

export type SubjectType = 'timeline' | 'group' | 'follow' | 'states'

export type SubjectSpec =
    | { type: 'timeline'; props: string[]; node: NodeSpec }
    | {
          type: 'group'
          props: string[]
          node: NodeSpec
          count: number
          stagger: number
      }
    | {
          type: 'follow'
          initial: Values
          spring: { m: number; k: number; c: number } | null
      }
    | {
          type: 'states'
          props: string[]
          nodes: NodeSpec[]
          initial: number
          initialValue: Values
      }

const PROPS = [
    'opacity',
    'width',
    'height',
    'top',
    'left',
    'translateX',
    'translateY',
    'rotate',
    'scale',
] as const

const RANGES: Record<string, readonly [number, number]> = {
    opacity: [0, 1],
    scale: [0.2, 2],
    rotate: [-180, 180],
}
const DEFAULT_RANGE = [-300, 300] as const

export function genProps(rng: Rng): string[] {
    const count = rng.int(1, 3)
    const pool: string[] = [...PROPS]
    const props: string[] = []
    for (let i = 0; i < count; i++) {
        props.push(...pool.splice(rng.int(0, pool.length - 1), 1))
    }
    return props
}

export function genValues(rng: Rng, props: readonly string[]): Values {
    const values: Values = {}
    for (const prop of props) {
        const [min, max] = RANGES[prop] ?? DEFAULT_RANGE
        values[prop] = rng.float(min, max)
    }
    return values
}

function genTiming(rng: Rng): TimingSpec {
    const kind = rng.weighted([4, 3, 3])
    if (kind === 0) return { t: 'linear' }
    if (kind === 1) {
        return {
            t: 'bezier',
            p2: { x: rng.float(0, 1), y: rng.float(-0.5, 1.5) },
            p3: { x: rng.float(0, 1), y: rng.float(-0.5, 1.5) },
        }
    }
    return {
        t: 'spring',
        m: rng.float(0.5, 2),
        k: rng.float(50, 300),
        c: rng.float(8, 30),
    }
}

function genLeaf(rng: Rng, props: readonly string[]): NodeSpec {
    if (rng.chance(0.15)) return { t: 'delay', duration: rng.float(0.01, 0.3) }
    return {
        t: 'ani',
        to: genValues(rng, props),
        duration: rng.float(0.01, 0.5),
        timing: genTiming(rng),
    }
}

interface Budget {
    leaves: number
}

/** A random small tree; `loop` children get their own small budget. */
export function genNode(
    rng: Rng,
    props: readonly string[],
    depth = 0,
    budget: Budget = { leaves: 8 }
): NodeSpec {
    if (depth >= 2 || budget.leaves <= 1 || rng.chance(0.3)) {
        budget.leaves--
        return genLeaf(rng, props)
    }
    const kind = rng.weighted([3, 3, 2, 2])
    if (kind === 3) {
        return {
            t: 'loop',
            count: rng.int(1, 3),
            child: genNode(rng, props, depth + 1, { leaves: 3 }),
        }
    }
    const children: NodeSpec[] = []
    const count = rng.int(2, 3)
    for (let i = 0; i < count; i++) {
        children.push(genNode(rng, props, depth + 1, budget))
    }
    if (kind === 2) {
        return { t: 'stagger', offset: rng.float(0.01, 0.1), children }
    }
    return { t: kind === 0 ? 'sequence' : 'parallel', children }
}

/** Segments (`ani` and `delay` leaves) in the flattened plan, loops unrolled. */
export function segmentCount(node: NodeSpec): number {
    switch (node.t) {
        case 'ani':
        case 'delay':
            return 1
        case 'loop':
            return node.count * segmentCount(node.child)
        default:
            return node.children.reduce((sum, c) => sum + segmentCount(c), 0)
    }
}

export function hasDelay(node: NodeSpec): boolean {
    switch (node.t) {
        case 'ani':
            return false
        case 'delay':
            return true
        case 'loop':
            return hasDelay(node.child)
        default:
            return node.children.some(hasDelay)
    }
}

function buildTiming(a: CoreApi, timing: TimingSpec): unknown {
    switch (timing.t) {
        case 'linear':
            return a.timing.linear()
        case 'bezier':
            return a.timing.bezier({ p2: timing.p2, p3: timing.p3 })
        default:
            return a.timing.spring({ m: timing.m, k: timing.k, c: timing.c })
    }
}

export function buildNode(a: CoreApi, node: NodeSpec): unknown {
    switch (node.t) {
        case 'ani':
            return a.ani({
                to: { ...node.to },
                duration: node.duration,
                timing: buildTiming(a, node.timing),
            })
        case 'delay':
            return a.delay(node.duration)
        case 'sequence':
            return a.sequence(node.children.map((c) => buildNode(a, c)))
        case 'parallel':
            return a.parallel(node.children.map((c) => buildNode(a, c)))
        case 'stagger':
            return a.stagger(
                node.children.map((c) => buildNode(a, c)),
                { offset: node.offset }
            )
        default:
            return a.loop(buildNode(a, node.child), node.count)
    }
}

export function genSubject(rng: Rng): SubjectSpec {
    const type = (['timeline', 'group', 'follow', 'states'] as const)[
        rng.weighted([4, 2, 2, 2])
    ]!
    if (type === 'follow') {
        const props = genProps(rng)
        return {
            type,
            initial: genValues(rng, props),
            spring: rng.chance(0.3)
                ? {
                      m: rng.float(0.5, 2),
                      k: rng.float(50, 300),
                      c: rng.float(8, 30),
                  }
                : null,
        }
    }
    const props = genProps(rng)
    if (type === 'timeline') return { type, props, node: genNode(rng, props) }
    if (type === 'group') {
        return {
            type,
            props,
            node: genNode(rng, props),
            count: rng.int(2, 20),
            stagger: rng.chance(0.5) ? rng.float(0, 0.05) : 0,
        }
    }
    const states = rng.int(2, 4)
    const nodes: NodeSpec[] = []
    for (let i = 0; i < states; i++) nodes.push(genNode(rng, props))
    return {
        type,
        props,
        nodes,
        initial: rng.int(0, states - 1),
        initialValue: genValues(rng, props),
    }
}
