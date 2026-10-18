// @vitest-environment node

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as vue from '../../index'

const vueRoot = join(__dirname, '..', '..', '..')
const aniDir = join(vueRoot, 'src', 'ani')
const docsDir = join(vueRoot, '..', 'web', 'content', 'docs', 'vue')

const stripComments = (code: string) =>
    code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const sources = () =>
    readdirSync(aniDir)
        .filter((file) => file.endsWith('.ts'))
        .map((file) => ({
            file,
            code: stripComments(readFileSync(join(aniDir, file), 'utf8')),
        }))

describe('vue package surface', () => {
    it('A1: exports the six primitives', () => {
        for (const name of [
            'useTimeline',
            'useAni',
            'useAniRef',
            'useAniGroup',
            'useAniStates',
            'useFollow',
        ] as const) {
            expect(typeof vue[name], name).toBe('function')
        }
    })

    it('A2: no event helpers are exported', () => {
        const names = Object.keys(vue)
        expect(names).not.toContain('EventManager')
        expect(names).not.toContain('AniRefContext')
        expect(names).not.toContain('createEventManager')
    })

    it('A3: the sources never use the removed events API', () => {
        const files = sources()
        expect(files.length).toBeGreaterThan(0)
        for (const { file, code } of files) {
            expect(code, file).not.toMatch(/EventManager/)
            expect(code, file).not.toMatch(/AniRefContext/)
            expect(code, file).not.toMatch(/cleanupEvents/)
        }
    })

    it('A4: writes go through core only (no applyStyleSheet, no direct element.style writes)', () => {
        for (const { file, code } of sources()) {
            expect(code, file).not.toMatch(/applyStyleSheet/)
            expect(code, file).not.toMatch(/\.style\.[A-Za-z-]+\s*=[^=]/)
            expect(code, file).not.toMatch(/\.style\[[^\]]+\]\s*=[^=]/)
            expect(code, file).not.toMatch(/\.style\.setProperty/)
            expect(code, file).not.toMatch(/\.style\.cssText/)
            expect(code, file).not.toMatch(/\.setAttribute\(\s*['"]style/)
        }
    })

    it('A5: no source file other than use_ani.ts creates a timeline controller', () => {
        for (const { file, code } of sources()) {
            if (file === 'use_ani.ts') continue
            expect(code, file).not.toMatch(/createTimelineController/)
        }
    })

    it('A6: API.md documents every primitive and drops the events API', () => {
        const api = readFileSync(join(vueRoot, 'src', 'API.md'), 'utf8')
        for (const name of [
            'useTimeline',
            'useAni',
            'useAniRef',
            'useAniGroup',
            'useAniStates',
            'useFollow',
        ]) {
            expect(api, name).toContain(`\`${name}\``)
        }
        expect(api).not.toMatch(/EventManager|AniRefContext|cleanupEvents/)
    })

    it('A7: the docs folder has a page for each new primitive, listed in meta.json', () => {
        const meta = JSON.parse(
            readFileSync(join(docsDir, 'meta.json'), 'utf8')
        ) as { pages: string[] }
        const files = readdirSync(docsDir)
        for (const page of [
            'use-timeline',
            'use-ani-group',
            'use-follow',
            'use-ani',
            'use-ani-ref',
            'use-ani-states',
        ]) {
            expect(meta.pages, page).toContain(page)
            expect(
                existsSync(join(docsDir, `${page}.mdx`)) ||
                    existsSync(join(docsDir, `${page}.md`)),
                page
            ).toBe(true)
        }
        for (const file of files.filter((f) => /\.mdx?$/.test(f))) {
            const text = readFileSync(join(docsDir, file), 'utf8')
            expect(text, file).not.toMatch(
                /EventManager|AniRefContext|cleanupEvents/
            )
        }
    })
})
