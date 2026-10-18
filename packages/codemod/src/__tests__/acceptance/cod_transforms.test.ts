import { describe, expect, it } from 'vitest'
import { transform } from '../../index'

const CORE = `import { a } from '@freestylejs/ani-core'\n`
const NS = `import * as a from '@freestylejs/ani-core'\n`

/** Runs the transform on `CORE + body` and returns the body part of the output. */
function body(input: string, fileName = 'file.ts') {
    const { code, warnings } = transform(CORE + input, fileName)
    expect(code.startsWith(NS), code).toBe(true)
    return { code: code.slice(NS.length), rules: warnings.map((w) => w.rule) }
}

describe('COD: imports and timeline names', () => {
    it('A1: the a object becomes a namespace import', () => {
        expect(transform(CORE, 'f.ts').code).toBe(NS)
    })

    it('A2: other named imports are split into their own declaration', () => {
        const out = transform(
            `import { a, createClock } from '@freestylejs/ani-core'\n`,
            'f.ts'
        ).code
        expect(out).toBe(
            `import * as a from '@freestylejs/ani-core'\nimport { createClock } from '@freestylejs/ani-core'\n`
        )
    })

    it('A3: deprecated timeline names', () => {
        expect(
            body('a.dynamicTimeline(n)\na.timeline(n)\na.webTimeline(n)\n').code
        ).toBe('a.rafTimeline(n)\na.waapiTimeline(n)\na.waapiTimeline(n)\n')
        const named = transform(
            `import { webTimeline, webTimeline as wt } from '@freestylejs/ani-core'\nwebTimeline(n)\nwt(n)\n`,
            'f.ts'
        ).code
        expect(named).toBe(
            `import { waapiTimeline, waapiTimeline as wt } from '@freestylejs/ani-core'\nwaapiTimeline(n)\nwt(n)\n`
        )
    })

    it('A4: files without an ANI import are left alone', () => {
        const source = `function sequence(a: number, b: number) {}\nsequence(1, 2)\nx.getCurrentValue()\n`
        const { code, warnings } = transform(source, 'f.ts')
        expect(code).toBe(source)
        expect(warnings).toEqual([])
    })
})

describe('COD: node builders take an options object', () => {
    it('A5: sequence / parallel / loop / delay', () => {
        expect(body('a.sequence([x, y], a.timing.ease())\n').code).toBe(
            'a.sequence([x, y], { timing: a.timing.ease() })\n'
        )
        expect(body("a.sequence([x], undefined, 'id')\n").code).toBe(
            "a.sequence([x], { id: 'id' })\n"
        )
        expect(body("a.parallel(c, t, 'p')\n").code).toBe(
            "a.parallel(c, { timing: t, id: 'p' })\n"
        )
        expect(body('a.loop(n, 3, t)\na.loop(n, 3)\n').code).toBe(
            'a.loop(n, 3, { timing: t })\na.loop(n, 3)\n'
        )
        expect(body("a.delay(1, 'd')\na.delay(1)\n").code).toBe(
            "a.delay(1, { id: 'd' })\na.delay(1)\n"
        )
    })

    it('A6: stagger moves the offset into the options', () => {
        expect(body('a.stagger(c, 0.1)\na.stagger(c, 0.1, t)\n').code).toBe(
            'a.stagger(c, { offset: 0.1 })\na.stagger(c, { offset: 0.1, timing: t })\n'
        )
    })

    it('A7: ani moves the id into the props', () => {
        expect(
            body("a.ani({ to, duration: 1 }, 'x')\na.ani(props, 'x')\n").code
        ).toBe(
            "a.ani({ to, duration: 1, id: 'x' })\na.ani({ ...props, id: 'x' })\n"
        )
    })

    it('A8: named imports are rewritten too, unrelated functions are not', () => {
        const out = transform(
            `import { sequence } from '@freestylejs/ani-core'\nsequence(c, t)\nconst o = { sequence(x: unknown, y: unknown) {} }\no.sequence(c, t)\n`,
            'f.ts'
        ).code
        expect(out).toBe(
            `import { sequence } from '@freestylejs/ani-core'\nsequence(c, { timing: t })\nconst o = { sequence(x: unknown, y: unknown) {} }\no.sequence(c, t)\n`
        )
    })
})

describe('COD: timeline members', () => {
    it('A9: getters', () => {
        expect(
            body(
                't.getCurrentValue()!.x\nt.getCurrentVelocity()\nt.currentConfig\n'
            ).code
        ).toBe('t.value!.x\nt.velocity\nt.config\n')
    })

    it('A10: play(config, interruptible) becomes the interrupt option', () => {
        expect(
            body('t.play({ from: f }, false)\nt.play(cfg, true)\n').code
        ).toBe(
            't.play({ from: f, interrupt: false })\nt.play({ ...cfg, interrupt: true })\n'
        )
    })

    it('A11: an ambiguous two-identifier play is reported, not rewritten', () => {
        const { code, rules } = body('t.play(x, y)\n')
        expect(code).toBe('t.play(x, y)\n')
        expect(rules).toContain('ambiguous-play')
    })

    it('A12: transitionTo(state, config, interruptible)', () => {
        expect(
            body(
                "s.transitionTo('a', cfg, false)\ns.transitionTo('a', undefined, false)\n"
            ).code
        ).toBe(
            "s.transitionTo('a', { ...cfg, interrupt: false })\ns.transitionTo('a', { interrupt: false })\n"
        )
    })

    it('A13: delay in play configs is converted from milliseconds to seconds', () => {
        expect(
            body(
                't.play({ from: f, delay: 500 })\nt.play({ from: f, delay: 1500 })\nt.play({ from: f, delay: d })\nt.play({ from: f, delay: a + b })\nw.play(el, { from: f, delay: 200 })\n'
            ).code
        ).toBe(
            't.play({ from: f, delay: 0.5 })\nt.play({ from: f, delay: 1.5 })\nt.play({ from: f, delay: d / 1000 })\nt.play({ from: f, delay: (a + b) / 1000 })\nw.play(el, { from: f, delay: 0.2 })\n'
        )
    })

    it('A14: reset arguments are dropped with a warning', () => {
        const { code, rules } = body('t.reset(false, false)\n')
        expect(code).toBe('t.reset()\n')
        expect(rules).toContain('reset-arguments')
    })

    it('A15: RAF propertyResolver and context are reported; WAAPI options are renamed', () => {
        const raf = body(
            't.play({ from: f, propertyResolver: r, context: c })\n'
        )
        expect(raf.code).toBe(
            't.play({ from: f, propertyResolver: r, context: c })\n'
        )
        expect(raf.rules).toEqual(
            expect.arrayContaining(['property-resolver', 'context-removed'])
        )
        expect(
            body(
                'w.play(el, { from: f, propertyResolver: r, keyframeEffect: k })\nw.nativeAnimation\n'
            ).code
        ).toBe(
            'w.play(el, { from: f, resolver: r, effect: k })\nw.animations[0]\n'
        )
    })

    it('A16: rafTimeline(node, clock) takes an options object', () => {
        expect(body('a.rafTimeline(n, m.clock)\na.rafTimeline(n)\n').code).toBe(
            'a.rafTimeline(n, { clock: m.clock })\na.rafTimeline(n)\n'
        )
    })
})

describe('COD: state machines, clock, bindings', () => {
    it('A17: createStates initialFrom and onTimelineChange', () => {
        expect(
            body(
                'a.createStates({ initial: "i", initialFrom: f, states })\ns.onTimelineChange((t) => use(t))\ns.onTimelineChange(cb)\n'
            ).code
        ).toBe(
            'a.createStates({ initial: "i", initialValue: f, states })\ns.onTransition((_state, t) => use(t))\ns.onTransition((_state, timeline) => (cb)(timeline))\n'
        )
    })

    it('A18: AnimationClock statics become defaultClock', () => {
        const out = transform(
            `import { AnimationClock } from '@freestylejs/ani-core'\nAnimationClock.configure(0.1)\nAnimationClock.configure({ lagThreshold: 1 })\nconst c = AnimationClock.create()\n`,
            'f.ts'
        ).code
        expect(out).toBe(
            `import { defaultClock } from '@freestylejs/ani-core'\ndefaultClock.configure({ maxDeltaTime: 0.1 })\ndefaultClock.configure({ lagThreshold: 1 })\nconst c = defaultClock\n`
        )
        const reset = transform(
            `import { AnimationClock } from '@freestylejs/ani-core'\nAnimationClock.reset()\n`,
            'f.ts'
        )
        expect(reset.warnings.map((w) => w.rule)).toContain('clock-reset')
    })

    it('A19: React useAniRef(ref, props) is reported for a manual change', () => {
        const { warnings } = transform(
            `import { useAniRef } from '@freestylejs/ani-react'\nconst c = useAniRef(ref, { timeline: t })\n`,
            'f.tsx'
        )
        expect(warnings.map((w) => w.rule)).toContain('react-use-ani-ref')
        expect(warnings[0]).toMatchObject({ line: 2 })
    })

    it('A20: .vue and .svelte files: only script blocks are transformed', () => {
        const vue = `<template>\n  <div>a.timeline</div>\n</template>\n<script setup lang="ts">\nimport { a } from '@freestylejs/ani-core'\nconst t = a.timeline(n)\n</script>\n`
        expect(transform(vue, 'C.vue').code).toBe(
            `<template>\n  <div>a.timeline</div>\n</template>\n<script setup lang="ts">\nimport * as a from '@freestylejs/ani-core'\nconst t = a.waapiTimeline(n)\n</script>\n`
        )
    })

    it('A21: idempotent (delay conversion aside), and TSX parses', () => {
        const source = `${CORE}const el = <div ref={r} />\nt.play({ from: f }, false)\na.stagger(c, 0.1)\nt.getCurrentValue()\n`
        const once = transform(source, 'f.tsx').code
        expect(transform(once, 'f.tsx').code).toBe(once)
        expect(once).toContain('<div ref={r} />')
    })

    it('A22: warnings carry 1-based line and column', () => {
        const { warnings } = transform(`${CORE}\n  t.reset(true)\n`, 'f.ts')
        expect(warnings).toEqual([
            expect.objectContaining({
                rule: 'reset-arguments',
                line: 3,
                column: 3,
            }),
        ])
    })
})
