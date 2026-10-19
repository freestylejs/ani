import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const HEAD = `import * as a from '@freestylejs/ani-core'\n`

function out(body: string, fileName = 'f.ts') {
    const { code, warnings } = transform(HEAD + body, fileName)
    expect(code.startsWith(HEAD), code).toBe(true)
    return { code: code.slice(HEAD.length), rules: warnings.map((w) => w.rule) }
}

describe('COD: node builders', () => {
    it('rewrites nested builders and drops undefined options', () => {
        expect(
            out("a.sequence([a.parallel(c, t, 'p'), a.delay(1, 'd')], t2)\n")
                .code
        ).toBe(
            "a.sequence([a.parallel(c, { timing: t, id: 'p' }), a.delay(1, { id: 'd' })], { timing: t2 })\n"
        )
        expect(out('a.sequence(c, undefined)\n').code).toBe('a.sequence(c)\n')
        expect(out('a.stagger(c, 0.1, t, "s")\n').code).toBe(
            'a.stagger(c, { offset: 0.1, timing: t, id: "s" })\n'
        )
    })

    it('leaves v2 shapes, spreads and surplus arguments alone', () => {
        const same = [
            'a.sequence(c, { timing: t })\n',
            'a.sequence(...args)\n',
            'a.sequence(c, t, "i", extra)\n',
            'a.sequence(c)\n',
            'a.sequence()\n',
            'a.ani({ to })\n',
            'a.ani(...args)\n',
            'a.rafTimeline(n, { clock })\n',
            'a.rafTimeline(n, undefined)\n',
            'a.rafTimeline(n, ...rest)\n',
            'a.createStates(config)\n',
        ]
        for (const body of same) expect(out(body).code).toBe(body)
    })

    it('ani: undefined id, empty literal and trailing commas', () => {
        expect(out('a.ani(props, undefined)\n').code).toBe('a.ani(props)\n')
        expect(out("a.ani({}, 'x')\n").code).toBe("a.ani({ id: 'x' })\n")
        expect(out("a.ani({ to, }, 'x')\n").code).toBe(
            "a.ani({ to, id: 'x', })\n"
        )
    })

    it('keeps multi-line formatting around the rewritten arguments', () => {
        const input = `a.sequence(\n    [x],\n    t\n)\n`
        expect(out(input).code).toBe(
            `a.sequence(\n    [x],\n    { timing: t }\n)\n`
        )
    })

    it('keeps comments between the rewritten arguments', () => {
        expect(
            out("a.stagger(c, /* o */ 0.1, // t\n undefined, 'i')\n").code
        ).toBe("a.stagger(c, /* o */ { offset: 0.1, // t\n id: 'i' })\n")
    })

    it('renames initialFrom (also shorthand) and timeline member accesses', () => {
        expect(out('a.createStates({ initialFrom })\n').code).toBe(
            'a.createStates({ initialValue: initialFrom })\n'
        )
        expect(out('const f = a.webTimeline\n').code).toBe(
            'const f = a.waapiTimeline\n'
        )
    })
})

describe('COD: members', () => {
    it('play with interrupt on an empty or undefined config', () => {
        expect(out('t.play({}, false)\nt.play(undefined, true)\n').code).toBe(
            't.play({ interrupt: false })\nt.play({ interrupt: true })\n'
        )
    })

    it('play with more than two arguments or a spread is ambiguous', () => {
        const r = out('t.play(a1, b1, c1)\n')
        expect(r.code).toBe('t.play(a1, b1, c1)\n')
        expect(r.rules).toEqual(['ambiguous-play'])
    })

    it('transitionTo with an unknown third argument is ambiguous', () => {
        const r = out("s.transitionTo('a', cfg, flag)\n")
        expect(r.code).toBe("s.transitionTo('a', cfg, flag)\n")
        expect(r.rules).toEqual(['ambiguous-play'])
    })

    it('delay: shorthand, unary minus, undefined, strings, WAAPI renames', () => {
        expect(
            out(
                "t.play({ delay })\nt.play({ 'delay': -500 })\nt.play({ delay: undefined })\nt.play({ delay: (a + b) })\nt.play({ delay: o.d })\ns.transitionTo('x', { delay: 100 })\n"
            ).code
        ).toBe(
            "t.play({ delay: delay / 1000 })\nt.play({ 'delay': -0.5 })\nt.play({ delay: undefined })\nt.play({ delay: (a + b) / 1000 })\nt.play({ delay: o.d / 1000 })\ns.transitionTo('x', { delay: 0.1 })\n"
        )
        expect(
            out('w.play(el, { propertyResolver, keyframeEffect: k })\n').code
        ).toBe('w.play(el, { resolver: propertyResolver, effect: k })\n')
    })

    it('transitionTo converts the delay and keeps RAF warnings', () => {
        const r = out("s.transitionTo('x', { delay: 100, context: c }, true)\n")
        expect(r.code).toBe(
            "s.transitionTo('x', { delay: 0.1, context: c, interrupt: true })\n"
        )
        expect(r.rules).toEqual(['context-removed'])
    })

    it('onTimelineChange: function shapes', () => {
        expect(
            out(
                's.onTimelineChange(t => 1)\ns.onTimelineChange(() => 1)\ns.onTimelineChange(function (t) { return t })\ns.onTimelineChange(function () {})\ns.onTimelineChange()\n'
            ).code
        ).toBe(
            's.onTransition((_state, t) => 1)\ns.onTransition((_state) => 1)\ns.onTransition(function (_state, t) { return t })\ns.onTransition(function (_state) {})\ns.onTransition()\n'
        )
    })

    it('reset without arguments and getters with arguments are untouched', () => {
        const r = out('t.reset()\nt.getCurrentValue(1)\n')
        expect(r.code).toBe('t.reset()\nt.getCurrentValue(1)\n')
        expect(r.rules).toEqual([])
    })

    it('reset with a trailing comma loses all arguments', () => {
        expect(out('t.reset(true,)\n').code).toBe('t.reset()\n')
    })
})

describe('COD: imports and the clock', () => {
    it('keeps the semicolon, quotes and default import when splitting', () => {
        expect(
            transform(
                `import def, { a as ani, x } from "@freestylejs/ani-core";\nani.loop(n, 2, t);\n`,
                'f.ts'
            ).code
        ).toBe(
            `import * as ani from "@freestylejs/ani-core";\nimport def, { x } from "@freestylejs/ani-core";\nani.loop(n, 2, { timing: t });\n`
        )
    })

    it('keeps type-only imports type-only and uses the file newline', () => {
        expect(
            transform(
                `import type { a, T } from '@freestylejs/ani-core'\r\n`,
                'f.ts'
            ).code
        ).toBe(
            `import type * as a from '@freestylejs/ani-core'\r\nimport type { T } from '@freestylejs/ani-core'\r\n`
        )
    })

    it('a namespace import already is v2', () => {
        const source = `import * as a from '@freestylejs/ani-core'\nconst n = a.delay(1)\n`
        expect(transform(source, 'f.ts').code).toBe(source)
    })

    it('rewrites a only for ani packages; other bindings stay', () => {
        expect(
            transform(
                `import { a, useAni } from '@freestylejs/ani-react'\na.sequence(c, t)\n`,
                'f.tsx'
            ).code
        ).toBe(
            `import * as a from '@freestylejs/ani-react'\nimport { useAni } from '@freestylejs/ani-react'\na.sequence(c, { timing: t })\n`
        )
    })

    it('AnimationClock: keeps the import while references remain', () => {
        const r = transform(
            `import { AnimationClock, type X } from '@freestylejs/ani-core'\nAnimationClock.configure(0.5)\nconst k: typeof AnimationClock = AnimationClock\n`,
            'f.ts'
        )
        expect(r.code).toBe(
            `import { AnimationClock, defaultClock, type X } from '@freestylejs/ani-core'\ndefaultClock.configure({ maxDeltaTime: 0.5 })\nconst k: typeof AnimationClock = AnimationClock\n`
        )
    })

    it('AnimationClock: unused import is removed, existing defaultClock reused', () => {
        expect(
            transform(
                `import { AnimationClock } from '@freestylejs/ani-core'\nconst x = 1\n`,
                'f.ts'
            ).code
        ).toBe(`const x = 1\n`)
        expect(
            transform(
                `import def, { AnimationClock } from '@freestylejs/ani-core'\n`,
                'f.ts'
            ).code
        ).toBe(`import def from '@freestylejs/ani-core'\n`)
        expect(
            transform(
                `import { AnimationClock, defaultClock } from '@freestylejs/ani-core'\nAnimationClock.configure(1)\nvoid defaultClock\n`,
                'f.ts'
            ).code
        ).toBe(
            `import { defaultClock } from '@freestylejs/ani-core'\ndefaultClock.configure({ maxDeltaTime: 1 })\nvoid defaultClock\n`
        )
    })

    it('AnimationClock: unknown statics and spread configure arguments stay', () => {
        const source = `import { AnimationClock } from '@freestylejs/ani-core'\nAnimationClock.other()\nAnimationClock.configure(...xs)\n`
        const r = transform(source, 'f.ts')
        expect(r.code).toBe(
            `import { AnimationClock, defaultClock } from '@freestylejs/ani-core'\nAnimationClock.other()\ndefaultClock.configure(...xs)\n`
        )
    })

    it('AnimationClock.reset with arguments only reports clock-reset', () => {
        const r = transform(
            `import { AnimationClock } from '@freestylejs/ani-core'\nAnimationClock.reset(true)\n`,
            'f.ts'
        )
        expect(r.code).toContain('AnimationClock.reset(true)')
        expect(r.warnings.map((w) => w.rule)).toEqual(['clock-reset'])
    })

    it('aliased AnimationClock and property names called AnimationClock', () => {
        const r = transform(
            `import { AnimationClock as AC } from '@freestylejs/ani-core'\nconst o = { AnimationClock: 1 }\nvoid o.AnimationClock\nconst c = AC.create()\n`,
            'f.ts'
        )
        expect(r.code).toBe(
            `import { defaultClock } from '@freestylejs/ani-core'\nconst o = { AnimationClock: 1 }\nvoid o.AnimationClock\nconst c = defaultClock\n`
        )
    })
})

describe('COD: files', () => {
    it('reports 1-based positions for useAniRef in the right call', () => {
        const r = transform(
            `import { useAniRef } from '@freestylejs/ani-react'\nuseAniRef(ref)\n  useAniRef(ref, p)\n`,
            'f.tsx'
        )
        expect(r.warnings).toHaveLength(1)
        expect(r.warnings[0]).toMatchObject({
            rule: 'react-use-ani-ref',
            line: 3,
            column: 3,
        })
        expect(r.warnings[0]?.message).toMatch(/useAniRef/)
    })

    it('picks the script kind from the extension', () => {
        const jsx = `import { a } from '@freestylejs/ani-core'\nconst e = <div />\na.stagger(c, 1)\n`
        expect(transform(jsx, 'f.jsx').code).toContain('{ offset: 1 }')
        expect(transform(jsx, 'f.js').code).toContain('{ offset: 1 }')
        expect(() => transform(jsx, 'f.ts')).toThrow(/f\.ts:2:/)
        expect(
            transform(`import { a } from '@freestylejs/ani-core'\n`, 'x.mjs')
                .code
        ).toBe(`import * as a from '@freestylejs/ani-core'\n`)
        expect(
            transform(`import { a } from '@freestylejs/ani-core'\n`, 'x.d.cts')
                .code
        ).toBe(`import * as a from '@freestylejs/ani-core'\n`)
    })

    it('throws a located error on a syntax error in an ANI file', () => {
        const source = `import { a } from '@freestylejs/ani-core'\nconst = ;\n`
        expect(() => transform(source, 'bad.ts')).toThrow(/bad\.ts:2:/)
    })

    it('ignores syntax errors in files without an ANI import', () => {
        const source = `const = ; // @freestylejs/ani-core\n`
        expect(transform(source, 'bad.ts')).toEqual({
            code: source,
            warnings: [],
        })
    })

    it('svelte: script blocks, warnings are placed in the whole file', () => {
        const source = `<script context="module">\n  import { a } from '@freestylejs/ani-core'\n</script>\n<script lang="ts">\n  import { a } from '@freestylejs/ani-core'\n  const t = a.timeline(n)\n  t.reset(1)\n</script>\n<script src="x.js" />\n<p>{a.timeline}</p>\n`
        const r = transform(source, 'C.svelte')
        expect(r.code).toBe(
            `<script context="module">\n  import * as a from '@freestylejs/ani-core'\n</script>\n<script lang="ts">\n  import * as a from '@freestylejs/ani-core'\n  const t = a.waapiTimeline(n)\n  t.reset()\n</script>\n<script src="x.js" />\n<p>{a.timeline}</p>\n`
        )
        expect(r.warnings).toEqual([
            expect.objectContaining({
                rule: 'reset-arguments',
                line: 7,
                column: 3,
            }),
        ])
    })

    it('vue: blocks without ANI imports and files without scripts are unchanged', () => {
        const noAni = `<script>\nexport default {}\n</script>\n<template>@freestylejs/ani-core</template>\n`
        expect(transform(noAni, 'C.vue').code).toBe(noAni)
        expect(
            transform(`<template>@freestylejs/ani-core</template>`, 'C.vue')
                .code
        ).toBe(`<template>@freestylejs/ani-core</template>`)
    })

    it('vue: a syntax error in a script block is located in the file', () => {
        const source = `<template/>\n<script>\nimport { a } from '@freestylejs/ani-core'\nconst = ;\n</script>\n`
        expect(() => transform(source, 'C.vue')).toThrow(/C\.vue:4:/)
    })

    it('vue: ">" inside a quoted attribute does not end the opening tag', () => {
        const source = `<script setup lang="ts" generic="T extends Array<string>">\nimport { a } from '@freestylejs/ani-core'\nconst t = a.timeline(n)\n</script>\n`
        expect(transform(source, 'C.vue').code).toBe(
            `<script setup lang="ts" generic="T extends Array<string>">\nimport * as a from '@freestylejs/ani-core'\nconst t = a.waapiTimeline(n)\n</script>\n`
        )
    })

    it('markdown: a syntax error in a code fence with an ANI import is located in the file', () => {
        const source = `# Title\n\n@freestylejs/ani\n\n\`\`\`ts\nimport { a } from '@freestylejs/ani-core'\nconst = ;\n\`\`\`\n`
        expect(() => transform(source, 'doc.md')).toThrow(/doc\.md:7:/)
    })

    it('markdown: snippets with invalid syntax but no ANI import are left unchanged', () => {
        const source = `@freestylejs/ani\n\n\`\`\`ts\nconst x = [1, ...]\n\`\`\`\n\n\`\`\`ts\na.dynamicTimeline(n)\n\`\`\`\n`
        const out = transform(source, 'doc.md').code
        expect(out).toContain('const x = [1, ...]')
        expect(out).toContain('a.rafTimeline(n)')
    })

    it('markdown: case-insensitive languages, indentation and empty fences', () => {
        const source = `@freestylejs/ani\n  \`\`\`TypeScript\n  a.dynamicTimeline(n)\n  \`\`\`\n\`\`\`ts\n\`\`\`\n`
        expect(transform(source, 'doc.md').code).toBe(
            `@freestylejs/ani\n  \`\`\`TypeScript\n  a.rafTimeline(n)\n  \`\`\`\n\`\`\`ts\n\`\`\`\n`
        )
    })

    it('markdown: a block with its own ANI import does not implicitly alias a', () => {
        const source =
            '@freestylejs/ani\n\n```ts\nimport * as ani from "@freestylejs/ani-core"\nconst a = other()\na.dynamicTimeline(n)\nani.dynamicTimeline(n)\n```\n'
        const out = transform(source, 'x.md').code
        expect(out).toContain('a.dynamicTimeline(n)')
        expect(out).toContain('ani.rafTimeline(n)')
    })

    it('markdown: an empty fence does not swallow the following fence', () => {
        const source =
            '@freestylejs/ani\n\n```ts\n```\n\n```ts\na.dynamicTimeline(n)\n```\n'
        expect(transform(source, 'x.md').code).toBe(
            '@freestylejs/ani\n\n```ts\n```\n\n```ts\na.rafTimeline(n)\n```\n'
        )
    })
})

describe('COD: renamed imports are renamed everywhere', () => {
    it('values, typeof, shorthand and exports', () => {
        const r = transform(
            `import { dynamicTimeline } from '@freestylejs/ani-core'\nconst make = dynamicTimeline\nexport type T = ReturnType<typeof dynamicTimeline>\nconst o = { dynamicTimeline }\nexport { dynamicTimeline }\nmake(node)\n`,
            'f.ts'
        )
        expect(r.code).toBe(
            `import { rafTimeline } from '@freestylejs/ani-core'\nconst make = rafTimeline\nexport type T = ReturnType<typeof rafTimeline>\nconst o = { dynamicTimeline: rafTimeline }\nexport { rafTimeline as dynamicTimeline }\nmake(node)\n`
        )
        expect(r.warnings).toEqual([])
    })

    it('export aliases, re-exports and property keys are not references', () => {
        const r = transform(
            `import { webTimeline } from '@freestylejs/ani-core'\nexport { webTimeline as w }\nexport { webTimeline as x } from './other'\nconst o = { webTimeline: 1 }\nvoid o.webTimeline\n`,
            'f.ts'
        )
        expect(r.code).toBe(
            `import { waapiTimeline } from '@freestylejs/ani-core'\nexport { waapiTimeline as w }\nexport { webTimeline as x } from './other'\nconst o = { webTimeline: 1 }\nvoid o.webTimeline\n`
        )
    })

    it('a shadowing parameter, variable or catch binding is left alone', () => {
        const r = transform(
            `import { timeline } from '@freestylejs/ani-core'\nfunction f(timeline) { return timeline }\nfunction g({ timeline: [timeline] }) { return timeline }\n{ const timeline = 1; void timeline }\nfor (const timeline of xs) void timeline\ntry {} catch (timeline) { void timeline }\nvoid timeline\n`,
            'f.ts'
        )
        expect(r.code).toBe(
            `import { waapiTimeline } from '@freestylejs/ani-core'\nfunction f(timeline) { return timeline }\nfunction g({ timeline: [timeline] }) { return timeline }\n{ const timeline = 1; void timeline }\nfor (const timeline of xs) void timeline\ntry {} catch (timeline) { void timeline }\nvoid waapiTimeline\n`
        )
    })

    it('typeof a.timeline on the namespace', () => {
        expect(out('type T = typeof a.timeline\n').code).toBe(
            'type T = typeof a.waapiTimeline\n'
        )
    })

    it('an aliased defaultClock does not count as imported', () => {
        expect(
            transform(
                `import { AnimationClock, defaultClock as dc } from '@freestylejs/ani-core'\nAnimationClock.configure(1)\nvoid dc\n`,
                'f.ts'
            ).code
        ).toBe(
            `import { defaultClock, defaultClock as dc } from '@freestylejs/ani-core'\ndefaultClock.configure({ maxDeltaTime: 1 })\nvoid dc\n`
        )
    })
})

describe('COD: clock arguments are never dropped or guessed', () => {
    const IMPORT = `import { AnimationClock } from '@freestylejs/ani-core'\n`

    it('create(maxDeltaTime) is kept and reported', () => {
        const r = transform(
            `${IMPORT}const c = AnimationClock.create(0.05)\n`,
            'f.ts'
        )
        expect(r.code).toContain('AnimationClock.create(0.05)')
        expect(r.warnings.map((w) => w.rule)).toEqual(['clock-create'])
    })

    it('configure wraps numeric literal with no warning', () => {
        const r = transform(
            `${IMPORT}AnimationClock.configure(0.05)\nAnimationClock.configure(-2)\n`,
            'f.ts'
        )
        expect(r.code).toBe(
            `import { defaultClock } from '@freestylejs/ani-core'\ndefaultClock.configure({ maxDeltaTime: 0.05 })\ndefaultClock.configure({ maxDeltaTime: -2 })\n`
        )
        expect(r.warnings).toEqual([])
    })

    it('configure leaves object literal unchanged with no warning', () => {
        const r = transform(
            `${IMPORT}AnimationClock.configure({ lagThreshold: 1 })\nAnimationClock.configure({ maxDeltaTime: 0.1 })\n`,
            'f.ts'
        )
        expect(r.code).toBe(
            `import { defaultClock } from '@freestylejs/ani-core'\ndefaultClock.configure({ lagThreshold: 1 })\ndefaultClock.configure({ maxDeltaTime: 0.1 })\n`
        )
        expect(r.warnings).toEqual([])
    })

    it('configure warns on identifier, member and call expression', () => {
        const r = transform(
            `${IMPORT}AnimationClock.configure(opts)\nAnimationClock.configure(o.n)\nAnimationClock.configure(getDelta())\n`,
            'f.ts'
        )
        expect(r.code).toBe(
            `import { defaultClock } from '@freestylejs/ani-core'\ndefaultClock.configure(opts)\ndefaultClock.configure(o.n)\ndefaultClock.configure(getDelta())\n`
        )
        expect(r.warnings.map((w) => w.rule)).toEqual([
            'clock-configure-argument',
            'clock-configure-argument',
            'clock-configure-argument',
        ])
        expect(r.warnings[0]?.message).toBe(
            '`configure` takes `{ lagThreshold, maxDeltaTime }` in ANI 2; if this value is a number, pass `{ maxDeltaTime: value }`.'
        )
        expect(r.warnings[0]).toMatchObject({
            rule: 'clock-configure-argument',
            line: 2,
            column: 1,
        })
    })
})
