import type {
    Clock,
    CoreModules,
    FollowHandle,
    GroupHandle,
    ManualClock,
    RunResult,
    StatesHandle,
    TimelineHandle,
    Unsubscribe,
    Values,
} from './core_api.ts'
import { RUN_RESULTS } from './core_api.ts'
import {
    createFakeElement,
    type FakeElement,
    parseWritten,
} from './fake_element.ts'
import type { Op, OpKind } from './ops.ts'
import { OP_KINDS } from './ops.ts'
import { hash32 } from './rng.ts'
import { buildNode, hasDelay, type SubjectType, segmentCount } from './spec.ts'

/** Thrown on purpose by a listener; every one must surface exactly once. */
export class SoakListenerError extends Error {}

export interface Violation {
    invariant: string
    message: string
}

// One frame is 16 ms: every delta the clock hands out is exactly this, also
// after a 2 s gap or a hidden tab (a suspension advances by one ordinary frame).
const FRAME_MS = 16
const FRAME_SECONDS = FRAME_MS / 1000
const LISTENER_THROW_ONE_IN = 50
const RECENT = 20
const SETTLE_CAP = 100

type Handle = TimelineHandle | GroupHandle | FollowHandle | StatesHandle

type SubjectOp = Exclude<
    Op,
    { k: 'create' | 'frame' | 'advance' | 'hidden' | 'rm' }
>

interface Rec {
    sid: number
    kind: OpKind
    createdSeq: number
    result: RunResult | null
    settledSeq: number
}

interface ListenerRec {
    id: number
    seed: number
    calls: number
    frameCalls: number
    n: number
    probe: boolean
    dead: boolean
    off: Unsubscribe
}

interface Binding {
    id: number
    targets: FakeElement[]
    at: number | null
    off: Unsubscribe
    seenValue: Array<object | null>
    seenWrites: number[]
}

export interface Subject {
    id: number
    type: SubjectType
    obj: Handle
    props: string[]
    // group: number of targets
    count: number
    // segments per state (one entry unless `states`)
    segs: number[]
    delays: boolean[]
    bindings: Map<number, Binding>
    listeners: Map<number, ListenerRec>
    pending: Set<Rec>
    // seconds of start delay still to elapse, mirrors the engine's arithmetic
    delayLeft: number
    playingBefore: boolean
    expectNotify: boolean
    slot: number
}

export interface WorldOptions {
    core: CoreModules
}

const INTERRUPTERS: ReadonlySet<OpKind> = new Set([
    'play',
    'transition',
    'set',
    'add',
    'jump',
])

function isFiniteRecord(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false
    for (const key in value) {
        const entry = (value as Record<string, unknown>)[key]
        if (typeof entry !== 'number' || !Number.isFinite(entry)) return false
    }
    return true
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function describeError(error: unknown): string {
    return error instanceof Error
        ? (error.stack ?? error.message)
        : String(error)
}

export class World {
    readonly core: CoreModules
    readonly manual: ManualClock
    readonly clock: Clock

    readonly byType: Record<SubjectType, Subject[]> = {
        timeline: [],
        group: [],
        follow: [],
        states: [],
    }
    readonly subjects = new Map<number, Subject>()
    population = 0
    peak = 0

    /** Ops executed, by kind. */
    readonly stats: Record<string, number> = {}
    seq = 0
    frameNo = 0
    reducedMotion = false
    violation: Violation | null = null
    nextId = 1

    private readonly recent: Array<{ seq: number; frame: number; op: Op }> = []
    private recentAt = 0
    private openRecs = 0
    private readonly settled: Rec[] = []
    private disposedSubject: Subject | null = null
    private nonInterruptingSubjectId: number | null = null
    private readonly lastInterrupter = new Map<number, number>()
    private inFrame = false
    private thrown = 0
    private surfaced = 0

    constructor(options: WorldOptions) {
        this.core = options.core
        this.manual = options.core.createManualClock({
            onError: (error) =>
                this.fail(
                    'I4 containment',
                    `the clock reported an error: ${describeError(error)}`
                ),
        })
        this.clock = this.manual.clock
        for (const kind of OP_KINDS) this.stats[kind] = 0
        this.warmUp()
    }

    // The first ordinary frame teaches the clock its frame length; do it once
    // up front so every later delta is exactly one frame.
    private warmUp(): void {
        const probe = { update: () => undefined }
        this.clock.subscribe(probe)
        this.manual.frame(FRAME_MS)
        this.clock.unsubscribe(probe)
    }

    fail(invariant: string, message: string): void {
        if (this.violation === null) this.violation = { invariant, message }
    }

    onUncaught(error: unknown): void {
        if (error instanceof SoakListenerError) this.surfaced++
        else this.fail('uncaught', describeError(error))
    }

    recentOps(): string[] {
        const lines: string[] = []
        const count = Math.min(this.recent.length, RECENT)
        for (let i = 0; i < count; i++) {
            const entry = this.recent[(this.recentAt + i) % this.recent.length]!
            let text = JSON.stringify(entry.op)
            if (text.length > 400) text = `${text.slice(0, 400)}...`
            lines.push(`#${entry.seq} f${entry.frame} ${text}`)
        }
        return lines
    }

    private remember(op: Op): void {
        const entry = { seq: this.seq, frame: this.frameNo, op }
        if (this.recent.length < RECENT) {
            this.recent.push(entry)
            this.recentAt = 0
        } else {
            this.recent[this.recentAt] = entry
            this.recentAt = (this.recentAt + 1) % RECENT
        }
    }

    // ---- subjects

    statusOf(sub: Subject): string {
        return sub.type === 'states'
            ? (sub.obj as StatesHandle).timeline().status
            : (sub.obj as { status: string }).status
    }

    /** The object a pause / resume / seek / reset goes to; a follower has none. */
    private controller(sub: Subject): TimelineHandle | GroupHandle | null {
        if (sub.type === 'follow') return null
        if (sub.type === 'states') return (sub.obj as StatesHandle).timeline()
        return sub.obj as TimelineHandle | GroupHandle
    }

    private valueOf(sub: Subject, index: number): Values | null {
        switch (sub.type) {
            case 'timeline':
                return (sub.obj as TimelineHandle).value
            case 'group':
                return (sub.obj as GroupHandle).valueAt(index)
            case 'follow':
                return (sub.obj as FollowHandle).value
            default:
                return (sub.obj as StatesHandle).timeline().value
        }
    }

    private create(op: Extract<Op, { k: 'create' }>): void {
        if (this.subjects.has(op.id)) return
        const { a } = this.core
        const clock = this.clock
        const spec = op.spec
        let obj: Handle
        let props: string[]
        let count = 0
        let segs: number[]
        let delays: boolean[]
        switch (spec.type) {
            case 'timeline':
                obj = a.rafTimeline(buildNode(a, spec.node), { clock })
                props = spec.props
                segs = [segmentCount(spec.node)]
                delays = [hasDelay(spec.node)]
                break
            case 'group':
                obj = a.rafGroup(buildNode(a, spec.node), {
                    clock,
                    stagger: spec.stagger,
                })
                props = spec.props
                count = spec.count
                segs = [segmentCount(spec.node)]
                delays = [hasDelay(spec.node)]
                break
            case 'follow':
                obj = a.follow(
                    { ...spec.initial },
                    spec.spring
                        ? { clock, spring: { ...spec.spring } }
                        : { clock }
                )
                props = Object.keys(spec.initial)
                segs = [1]
                delays = [false]
                break
            default: {
                const states: Record<string, unknown> = {}
                spec.nodes.forEach((node, i) => {
                    states[`st${i}`] = buildNode(a, node)
                })
                obj = a.createStates({
                    initial: `st${spec.initial}`,
                    initialValue: { ...spec.initialValue },
                    states,
                    clock,
                })
                props = spec.props
                segs = spec.nodes.map(segmentCount)
                delays = spec.nodes.map(hasDelay)
                break
            }
        }
        const list = this.byType[spec.type]
        const sub: Subject = {
            id: op.id,
            type: spec.type,
            obj,
            props,
            count,
            segs,
            delays,
            bindings: new Map(),
            listeners: new Map(),
            pending: new Set(),
            delayLeft: 0,
            playingBefore: false,
            expectNotify: false,
            slot: list.length,
        }
        list.push(sub)
        this.subjects.set(sub.id, sub)
        this.population++
        if (this.population > this.peak) this.peak = this.population
        if (op.watched) this.addListener(sub, 0, 0, true)
    }

    private addListener(
        sub: Subject,
        id: number,
        seed: number,
        probe: boolean
    ): void {
        if (sub.listeners.has(id)) return
        const l: ListenerRec = {
            id,
            seed,
            calls: 0,
            frameCalls: 0,
            n: 0,
            probe,
            dead: false,
            off: () => undefined,
        }
        l.off = sub.obj.onUpdate(() => {
            l.calls++
            if (this.inFrame) {
                l.frameCalls++
                if (l.frameCalls > 1) {
                    this.fail(
                        'I4 containment',
                        `listener ${l.id} of #${sub.id} (${sub.type}) was called a second time in frame ${this.frameNo}`
                    )
                }
            }
            if (l.dead) {
                this.fail(
                    'I5 disposal',
                    `listener ${l.id} of #${sub.id} (${sub.type}) was called after it was removed or its object disposed`
                )
            }
            if (
                !l.probe &&
                hash32(l.seed, l.n++) % LISTENER_THROW_ONE_IN === 0
            ) {
                this.thrown++
                throw new SoakListenerError(
                    `listener ${l.id} of #${sub.id} threw on purpose`
                )
            }
        })
        sub.listeners.set(id, l)
    }

    private removeSubject(sub: Subject): void {
        const list = this.byType[sub.type]
        const last = list[list.length - 1]!
        list[sub.slot] = last
        last.slot = sub.slot
        list.pop()
        this.subjects.delete(sub.id)
        this.population--
    }

    private track(sub: Subject, op: Op, promise: Promise<RunResult>): void {
        if (typeof promise?.then !== 'function') {
            this.fail(
                'I1 settle once',
                `${op.k} on #${sub.id} returned no promise`
            )
            return
        }
        const rec: Rec = {
            sid: sub.id,
            kind: op.k,
            createdSeq: this.seq,
            result: null,
            settledSeq: -1,
        }
        sub.pending.add(rec)
        this.openRecs++
        promise.then((result) => {
            rec.result = result
            rec.settledSeq = this.seq
            sub.pending.delete(rec)
            this.openRecs--
            this.settled.push(rec)
        })
    }

    // ---- operations

    /** Runs one op synchronously; any throw is a violation (inputs are valid). */
    exec(op: Op): void {
        this.seq++
        this.stats[op.k] = (this.stats[op.k] ?? 0) + 1
        this.remember(op)
        this.disposedSubject = null
        this.nonInterruptingSubjectId = null
        if (INTERRUPTERS.has(op.k) && 's' in op) {
            this.lastInterrupter.set(op.s, this.seq)
        }
        try {
            this.run(op)
        } catch (error) {
            this.fail(
                'op',
                `${op.k} threw instead of completing: ${describeError(error)}`
            )
        }
    }

    private run(op: Op): void {
        switch (op.k) {
            case 'create':
                return this.create(op)
            case 'frame':
                return this.runFrame()
            case 'advance':
                return this.manual.advance(op.ms)
            case 'hidden':
                return this.manual.setHidden(op.on)
            case 'rm':
                this.reducedMotion = op.on
                return this.manual.setReducedMotion(op.on)
            default:
                return this.runOnSubject(op)
        }
    }

    private runOnSubject(op: SubjectOp): void {
        const sub = this.subjects.get(op.s)
        if (sub === undefined) return
        switch (op.k) {
            case 'play':
                return this.play(sub, op)
            case 'transition':
                return this.transition(sub, op)
            case 'set':
            case 'add':
            case 'jump':
                return this.follow(sub, op)
            case 'pause':
            case 'resume':
                return void this.controller(sub)?.[op.k]()
            case 'reset':
                this.controller(sub)?.reset()
                sub.delayLeft = 0
                return
            case 'seek':
                this.controller(sub)?.seek(op.time)
                sub.delayLeft = 0
                return
            case 'bind':
                return this.bind(sub, op)
            case 'unbind':
                return this.unbind(sub, op.b)
            case 'sub':
                return this.addListener(sub, op.l, op.seed, false)
            case 'unsub':
                return this.removeListener(sub, op.l)
            default:
                return this.dispose(sub)
        }
    }

    private copyKeyframes(keyframes: Extract<Op, { k: 'play' }>['keyframes']) {
        return keyframes?.map((entry) =>
            entry === 'keep' ? entry : { ...entry }
        )
    }

    private play(sub: Subject, op: Extract<Op, { k: 'play' }>): void {
        const keyframes = this.copyKeyframes(op.keyframes)
        if (sub.type === 'timeline') {
            const timeline = sub.obj as TimelineHandle
            const wasPlaying = timeline.status === 'PLAYING'
            if (!op.interrupt && wasPlaying) {
                this.nonInterruptingSubjectId = sub.id
            }
            const promise = timeline.play({
                from: { ...op.from },
                repeat: op.repeat,
                interrupt: op.interrupt,
                delay: op.delay * 1e-3,
                ...(keyframes && { keyframes }),
            })
            if (!(wasPlaying && !op.interrupt)) {
                sub.delayLeft = op.delay * 1e-3
            }
            this.track(sub, op, promise)
        } else if (sub.type === 'group') {
            const from = op.step
            const base = op.from
            const promise = (sub.obj as GroupHandle).play({
                from: from
                    ? (index: number) => {
                          const value: Values = {}
                          for (const key in base) {
                              value[key] = base[key]! + from[key]! * index
                          }
                          return value
                      }
                    : { ...base },
                count: sub.count,
                repeat: op.repeat,
                delay: op.delay * 1e-3,
                ...(keyframes && { keyframes }),
            })
            sub.delayLeft = op.delay * 1e-3
            this.track(sub, op, promise)
        }
    }

    private transition(
        sub: Subject,
        op: Extract<Op, { k: 'transition' }>
    ): void {
        if (sub.type !== 'states') return
        const states = sub.obj as StatesHandle
        const wasPlaying = states.timeline().status === 'PLAYING'
        if (!op.interrupt && wasPlaying) {
            this.nonInterruptingSubjectId = sub.id
        }
        const keyframes = this.copyKeyframes(op.keyframes)
        const promise = states.transitionTo(`st${op.to}`, {
            repeat: op.repeat,
            interrupt: op.interrupt,
            delay: op.delay * 1e-3,
            ...(op.from && { from: { ...op.from } }),
            ...(keyframes && { keyframes }),
        })
        if (!(wasPlaying && !op.interrupt)) sub.delayLeft = op.delay * 1e-3
        this.track(sub, op, promise)
    }

    private follow(
        sub: Subject,
        op: Extract<Op, { k: 'set' | 'add' | 'jump' }>
    ): void {
        if (sub.type !== 'follow') return
        const follower = sub.obj as FollowHandle
        if (op.k === 'jump') {
            follower.jump({ ...op.to })
            return
        }
        let to: Values
        if (op.k === 'add') {
            const target = follower.target
            to = {}
            for (const key in op.delta) {
                to[key] = clamp(target[key]! + op.delta[key]!, -1000, 1000)
            }
        } else {
            to = { ...op.to }
        }
        const promise = follower.set(
            to,
            op.velocity ? { velocity: { ...op.velocity } } : undefined
        )
        this.track(sub, op, promise)
    }

    private bind(sub: Subject, op: Extract<Op, { k: 'bind' }>): void {
        if (sub.bindings.has(op.b)) return
        const dead = (element: FakeElement): void =>
            this.fail(
                'I5 disposal',
                `target ${element.id} of #${sub.id} (${sub.type}) was written after it was unbound or its object disposed`
            )
        const n = sub.type === 'group' && op.at === null ? (op.many ?? 1) : 1
        const targets: FakeElement[] = []
        for (let i = 0; i < n; i++) {
            targets.push(createFakeElement(op.b * 100 + i, dead))
        }
        let off: Unsubscribe
        if (sub.type === 'group') {
            const group = sub.obj as GroupHandle
            off =
                op.at === null
                    ? group.bind(targets)
                    : group.bindAt(op.at, targets[0]!)
        } else {
            off = (sub.obj as TimelineHandle).bind(targets[0]!)
        }
        sub.bindings.set(op.b, {
            id: op.b,
            targets,
            at: op.at,
            off,
            seenValue: new Array(n).fill(null),
            seenWrites: new Array(n).fill(-1),
        })
    }

    private unbind(sub: Subject, id: number): void {
        const binding = sub.bindings.get(id)
        if (binding === undefined) return
        binding.off()
        // idempotent
        binding.off()
        for (const element of binding.targets) element.dead = true
        sub.bindings.delete(id)
    }

    private removeListener(sub: Subject, id: number): void {
        const l = sub.listeners.get(id)
        if (l === undefined) return
        l.off()
        l.off()
        l.dead = true
        sub.listeners.delete(id)
    }

    private dispose(sub: Subject): void {
        sub.obj.dispose()
        // idempotent
        sub.obj.dispose()
        for (const l of sub.listeners.values()) l.dead = true
        for (const binding of sub.bindings.values()) {
            for (const element of binding.targets) element.dead = true
        }
        this.removeSubject(sub)
        this.disposedSubject = sub
    }

    private runFrame(): void {
        this.frameNo++
        for (const type of Object.keys(this.byType) as SubjectType[]) {
            for (const sub of this.byType[type]) {
                for (const l of sub.listeners.values()) {
                    l.frameCalls = 0
                }
                const playing = this.statusOf(sub) === 'PLAYING'
                sub.playingBefore = playing
                sub.expectNotify = playing
                if (playing && sub.delayLeft > 0) {
                    sub.delayLeft -= FRAME_SECONDS
                    if (sub.delayLeft > 0) sub.expectNotify = false
                    else sub.delayLeft = 0
                }
            }
        }
        this.inFrame = true
        try {
            this.manual.frame(FRAME_MS)
        } finally {
            this.inFrame = false
        }
    }

    // ---- after an op

    /**
     * Lets the promises of the op settle (a macrotask drains every microtask),
     * then checks them against the op, and the frame invariants after a frame.
     */
    async settleAfter(op: Op): Promise<void> {
        if (this.openRecs > 0 || op.k === 'frame' || this.settled.length > 0) {
            await new Promise<void>((resolve) => setImmediate(resolve))
        }
        for (const rec of this.settled) this.checkSettled(rec, op)
        if (this.nonInterruptingSubjectId !== null) {
            const skipped = this.settled.some(
                (r) =>
                    r.createdSeq === this.seq &&
                    r.sid === this.nonInterruptingSubjectId &&
                    r.result === 'skipped'
            )
            if (!skipped) {
                this.fail(
                    'I1 settle once',
                    `${op.k} with interrupt: false on PLAYING #${this.nonInterruptingSubjectId} must settle 'skipped'`
                )
            }
        }
        this.settled.length = 0
        const gone = this.disposedSubject
        if (gone !== null && gone.pending.size > 0) {
            this.fail(
                'I1 settle once',
                `#${gone.id} (${gone.type}) still has ${gone.pending.size} pending promise(s) after dispose()`
            )
        }
        if (op.k === 'frame') this.checkFrame()
    }

    private checkSettled(rec: Rec, op: Op): void {
        const result = rec.result
        const where = `the ${rec.kind} promise of #${rec.sid} settled '${result}' during op #${this.seq} (${op.k})`
        if (result === null || !RUN_RESULTS.includes(result)) {
            this.fail('I1 settle once', `${where}: not a valid RunResult`)
            return
        }
        const sub = this.subjects.get(rec.sid)
        const atCreation = rec.createdSeq === rec.settledSeq
        const sameSubject = 's' in op && op.s === rec.sid
        let legal = false
        switch (result) {
            case 'ended':
                legal =
                    op.k === 'frame'
                        ? sub?.playingBefore === true
                        : atCreation &&
                          sub !== undefined &&
                          (this.reducedMotion ||
                              (sub.type === 'follow' &&
                                  (op.k === 'set' || op.k === 'add')))
                break
            case 'interrupted': {
                if (
                    sameSubject &&
                    !atCreation &&
                    this.nonInterruptingSubjectId === rec.sid
                ) {
                    this.fail(
                        'I1 settle once',
                        `the running run of #${rec.sid} settled 'interrupted' during an interrupt: false call on a PLAYING object`
                    )
                    return
                }
                const interruptedAt = this.lastInterrupter.get(rec.sid)
                legal =
                    (sameSubject && !atCreation && INTERRUPTERS.has(op.k)) ||
                    (op.k === 'frame' &&
                        interruptedAt !== undefined &&
                        interruptedAt > rec.createdSeq &&
                        interruptedAt < this.seq)
                break
            }
            case 'skipped':
                legal =
                    atCreation &&
                    (op.k === 'play' || op.k === 'transition') &&
                    !op.interrupt &&
                    this.nonInterruptingSubjectId === rec.sid
                break
            case 'reset':
                legal = sameSubject && !atCreation && op.k === 'reset'
                break
            case 'disposed':
                legal = sameSubject && !atCreation && op.k === 'dispose'
                break
            default:
                break
        }
        if (!legal) {
            this.fail(
                'I1 settle once',
                `${where}, but nothing in that op ends the run that way`
            )
        }
    }

    // ---- invariants checked after every frame

    private checkFrame(): void {
        let subscribed = 0
        for (const type of Object.keys(this.byType) as SubjectType[]) {
            for (const sub of this.byType[type]) {
                const isPlaying = this.statusOf(sub) === 'PLAYING'
                if (isPlaying) subscribed++
                this.checkValues(sub)
                this.checkTargets(sub)
                if (sub.expectNotify) this.checkListeners(sub)
            }
        }
        const size = this.clock.size
        if (size < 0 || size !== subscribed) {
            this.fail(
                'I2 subscription accounting',
                `clock.size is ${size} but ${subscribed} live objects are PLAYING`
            )
        }
    }

    private checkValues(sub: Subject): void {
        const indexes = sub.type === 'group' ? sub.count : 1
        for (let i = 0; i < indexes; i++) {
            const value = this.valueOf(sub, i)
            if (value !== null && !isFiniteRecord(value)) {
                this.fail(
                    'I3 values',
                    `#${sub.id} (${sub.type}) has a non-finite value${indexes > 1 ? ` at target ${i}` : ''}: ${JSON.stringify(value)}`
                )
                return
            }
        }
        if (sub.type === 'timeline' || sub.type === 'follow') {
            const velocity = (sub.obj as TimelineHandle).velocity
            if (velocity !== null && !isFiniteRecord(velocity)) {
                this.fail(
                    'I3 values',
                    `#${sub.id} (${sub.type}) has a non-finite velocity: ${JSON.stringify(velocity)}`
                )
            }
        }
    }

    private checkTargets(sub: Subject): void {
        for (const binding of sub.bindings.values()) {
            for (let j = 0; j < binding.targets.length; j++) {
                const element = binding.targets[j]!
                const value = this.valueOf(sub, binding.at ?? j)
                if (value === null) continue
                if (
                    binding.seenValue[j] === value &&
                    binding.seenWrites[j] === element.writes
                ) {
                    continue
                }
                binding.seenValue[j] = value
                binding.seenWrites[j] = element.writes
                const written = parseWritten(element)
                const keys = Object.keys(value)
                let same = Object.keys(written).length === keys.length
                for (const key of keys) {
                    if (written[key] !== value[key]) same = false
                }
                if (!same) {
                    this.fail(
                        'I3 values',
                        `target ${element.id} bound to #${sub.id} (${sub.type}${sub.type === 'group' ? ` index ${binding.at ?? j}` : ''}) holds ${JSON.stringify(Object.fromEntries(element.last))} (parsed ${JSON.stringify(written)}) but the value is ${JSON.stringify(value)}`
                    )
                    return
                }
            }
        }
    }

    private checkListeners(sub: Subject): void {
        for (const l of sub.listeners.values()) {
            if (l.frameCalls !== 1) {
                this.fail(
                    'I4 containment',
                    l.frameCalls === 0
                        ? `listener ${l.id} of #${sub.id} (${sub.type}) was not called in frame ${this.frameNo} although the object was PLAYING`
                        : `listener ${l.id} of #${sub.id} (${sub.type}) was called a second time in frame ${this.frameNo}`
                )
                return
            }
        }
    }

    // ---- teardown

    /** Disposes everything, lets the clock go idle, then checks I1, I2 and I5. */
    async teardown(step: (op: Op) => Promise<void>): Promise<void> {
        const all: number[] = []
        for (const type of Object.keys(this.byType) as SubjectType[]) {
            for (const sub of this.byType[type]) all.push(sub.id)
        }
        for (const id of all) {
            await step({ k: 'dispose', s: id })
            if (this.violation) return
        }
        let frames = 0
        while (this.clock.size > 0 || this.manual.pending > 0) {
            if (frames++ >= SETTLE_CAP) {
                this.fail(
                    'I2 subscription accounting',
                    `the clock is not idle ${SETTLE_CAP} frames after everything was disposed (size ${this.clock.size}, pending frames ${this.manual.pending})`
                )
                return
            }
            await step({ k: 'frame' })
            if (this.violation) return
        }
        await new Promise<void>((resolve) => setImmediate(resolve))
        if (this.clock.size !== 0) {
            this.fail(
                'I2 subscription accounting',
                `clock.size is ${this.clock.size} after teardown`
            )
        }
        if (this.openRecs !== 0) {
            this.fail(
                'I1 settle once',
                `${this.openRecs} promise(s) are still pending after teardown`
            )
        }
        if (this.thrown !== this.surfaced) {
            this.fail(
                'I4 containment',
                `listeners threw ${this.thrown} time(s) but ${this.surfaced} error(s) surfaced`
            )
        }
    }
}
