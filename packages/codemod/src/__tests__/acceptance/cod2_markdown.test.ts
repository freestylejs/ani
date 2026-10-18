import { describe, expect, it } from 'vitest'
import { transform } from '../../index'

const fence = (lang: string, body: string, ticks = '```') =>
    `${ticks}${lang}\n${body}${ticks}\n`

describe('COD2: Markdown and MDX code fences', () => {
    it('A1: a ts fence with its own import is transformed, prose untouched', () => {
        const md = `# Title\n\nUse a.timeline here in prose.\n\n${fence('ts', "import { a } from '@freestylejs/ani-core'\nconst t = a.timeline(n)\n")}\nAfter.\n`
        const out = transform(md, 'doc.md').code
        expect(out).toBe(
            `# Title\n\nUse a.timeline here in prose.\n\n${fence('ts', "import * as a from '@freestylejs/ani-core'\nconst t = a.waapiTimeline(n)\n")}\nAfter.\n`
        )
    })

    it('A2: later fences without an import still use the a namespace', () => {
        const mdx = `${fence('tsx title="setup.tsx"', "import { a } from '@freestylejs/ani-core'\n")}\n${fence('ts', 'a.stagger(c, 0.1)\nt.getCurrentValue()\n')}`
        const out = transform(mdx, 'page.mdx').code
        expect(out).toContain('a.stagger(c, { offset: 0.1 })\nt.value\n')
        expect(out).toContain("import * as a from '@freestylejs/ani-core'")
    })

    it('A3: other languages and files without ANI are left alone', () => {
        const shell = fence('bash', 'a.timeline(n)\n')
        const withAni = `@freestylejs/ani\n${shell}`
        expect(transform(withAni, 'x.md').code).toBe(withAni)
        const noAni = fence('ts', 'a.timeline(n)\n')
        expect(transform(noAni, 'x.md').code).toBe(noAni)
    })

    it('A4: tilde and long fences', () => {
        const md = `@freestylejs/ani\n${fence('js', 'a.dynamicTimeline(n)\n', '~~~~')}`
        expect(transform(md, 'x.md').code).toBe(
            `@freestylejs/ani\n${fence('js', 'a.rafTimeline(n)\n', '~~~~')}`
        )
    })

    it('A5: warnings carry positions in the whole file', () => {
        const md = `line one\n@freestylejs/ani\n\n${fence('ts', 'x\n  t.reset(true)\n')}`
        const { warnings } = transform(md, 'x.md')
        expect(warnings).toEqual([
            expect.objectContaining({
                rule: 'reset-arguments',
                line: 6,
                column: 3,
            }),
        ])
    })

    it('A6: the property-resolver warning points at bind', () => {
        const { warnings } = transform(
            `import { a } from '@freestylejs/ani-core'\nt.play({ from: f, propertyResolver: r })\n`,
            'f.ts'
        )
        const w = warnings.find((x) => x.rule === 'property-resolver')!
        expect(w.message).toBe(
            'Move `propertyResolver` out of the play config: pass it as `bind(element, { resolver })`.'
        )
    })
})
