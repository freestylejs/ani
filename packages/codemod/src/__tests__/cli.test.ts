import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { run } from '../run'
import { collectFiles } from '../walk'

const V1 = `import { a } from '@freestylejs/ani-core'\nconst t = a.timeline(n)\nt.reset(true)\n`
const V2 = `import * as a from '@freestylejs/ani-core'\nconst t = a.waapiTimeline(n)\nt.reset()\n`

let root: string

function put(path: string, content: string): string {
    const file = join(root, path)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, content)
    return file
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ani-codemod-'))
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

describe('COD: collectFiles', () => {
    it('walks directories, filters extensions and skips build folders', () => {
        const keep = [
            put('a.ts', ''),
            put('src/b.tsx', ''),
            put('src/deep/c.vue', ''),
            put('src/d.svelte', ''),
            put('src/e.mjs', ''),
            put('readme.md', ''),
            put('docs/guide.mdx', ''),
        ]
        put('notes.txt', '')
        put('node_modules/x/i.ts', '')
        put('dist/i.js', '')
        put('.git/i.js', '')
        put('.next/i.js', '')
        expect(collectFiles([root]).sort()).toEqual(keep.sort())
    })

    it('accepts files, de-duplicates and ignores unsupported files', () => {
        const file = put('a.ts', '')
        const other = put('b.txt', '')
        expect(collectFiles([file, root, other])).toEqual([file])
    })

    it('lists a file once when reached by a directory and another spelling', () => {
        const file = put('sub/a.ts', '')
        const alias = join(root, 'sub', '..', 'sub', 'a.ts')
        expect(collectFiles([alias, root])).toEqual([alias])
        expect(collectFiles([root, alias])).toEqual([file])
    })

    it('throws for a missing path', () => {
        expect(() => collectFiles([join(root, 'missing')])).toThrow()
    })
})

describe('COD: run', () => {
    function capture() {
        const log: string[] = []
        const error: string[] = []
        return {
            log,
            error,
            out: {
                log: (l: string) => log.push(l),
                error: (l: string) => error.push(l),
            },
        }
    }

    it('rewrites files, reports warnings and prints a summary', () => {
        const file = put('a.ts', V1)
        put('b.ts', 'export const x = 1\n')
        const { log, error, out } = capture()
        expect(run([root], out)).toBe(0)
        expect(readFileSync(file, 'utf8')).toBe(V2)
        expect(log).toEqual([
            expect.stringMatching(
                new RegExp(`^${file}:3:1 \\[reset-arguments\\] .+`)
            ),
            '1 files changed, 1 warnings',
        ])
        expect(error).toEqual([])
    })

    it('--dry does not write', () => {
        const file = put('a.ts', V1)
        const { log, out } = capture()
        expect(run(['--dry', file], out)).toBe(0)
        expect(readFileSync(file, 'utf8')).toBe(V1)
        expect(log.at(-1)).toBe('1 files changed, 1 warnings')
    })

    it('a second run changes nothing', () => {
        const file = put('a.ts', V1)
        run([file], capture().out)
        const { log, out } = capture()
        expect(run([file], out)).toBe(0)
        expect(log).toEqual(['0 files changed, 0 warnings'])
    })

    it('exits 1 on usage errors, missing paths and syntax errors', () => {
        let c = capture()
        expect(run([], c.out)).toBe(1)
        expect(c.error[0]).toMatch(/Usage/)
        c = capture()
        expect(run(['--nope', root], c.out)).toBe(1)
        expect(c.error[0]).toMatch(/Unknown option --nope/)
        c = capture()
        expect(run([join(root, 'missing')], c.out)).toBe(1)
        expect(c.error).toHaveLength(1)

        const good = put('good.ts', V1)
        const bad = put(
            'bad.ts',
            `import { a } from '@freestylejs/ani-core'\nconst = ;\n`
        )
        c = capture()
        expect(run([root], c.out)).toBe(1)
        expect(c.error[0]).toContain(`${bad}`)
        expect(readFileSync(good, 'utf8')).toBe(V2)
        expect(c.log.at(-1)).toBe('1 files changed, 1 warnings')
    })
})
