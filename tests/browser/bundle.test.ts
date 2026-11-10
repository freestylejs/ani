import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { bundleForBrowser, bundleForNode } from './bundle.ts'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

async function bundledDefines(
    mode: 'development' | 'production'
): Promise<{ nodeEnv: string; aniDev: boolean }> {
    const directory = await mkdtemp(join(tmpdir(), 'ani-browser-bundle-'))
    const entry = join(directory, 'entry.ts')
    try {
        await writeFile(
            entry,
            [
                'declare const __ANI_DEV__: boolean',
                'export const nodeEnv = process.env.NODE_ENV',
                'export const aniDev = __ANI_DEV__',
            ].join('\n')
        )
        const code = await bundleForBrowser(entry, { mode })
        const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
        const bundled = (await import(url)) as {
            nodeEnv: string
            aniDev: boolean
        }
        return { nodeEnv: bundled.nodeEnv, aniDev: bundled.aniDev }
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
}

test('production browser source build folds production defines', async () => {
    assert.deepEqual(await bundledDefines('production'), {
        nodeEnv: 'production',
        aniDev: false,
    })
})

test('development browser source build keeps development defines', async () => {
    assert.deepEqual(await bundledDefines('development'), {
        nodeEnv: 'development',
        aniDev: true,
    })
})

test('production Node source build folds the same production defines', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ani-node-bundle-'))
    const entry = join(directory, 'entry.ts')
    try {
        await writeFile(
            entry,
            [
                'declare const __ANI_DEV__: boolean',
                'export const nodeEnv = process.env.NODE_ENV',
                'export const aniDev = __ANI_DEV__',
            ].join('\n')
        )
        const code = await bundleForNode(entry, 'production')
        const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
        const bundled = (await import(url)) as {
            nodeEnv: string
            aniDev: boolean
        }
        assert.deepEqual(
            { nodeEnv: bundled.nodeEnv, aniDev: bundled.aniDev },
            { nodeEnv: 'production', aniDev: false }
        )
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('browser runner accepts an explicit production source build mode', () => {
    const result = spawnSync(
        process.execPath,
        ['tests/browser/run.ts', '--build', 'production', '--help'],
        {
            cwd: REPO_ROOT,
            encoding: 'utf8',
        }
    )
    assert.equal(result.status, 1)
    assert.doesNotMatch(result.stderr, /unknown option/)
    assert.match(result.stderr, /--build <mode>/)
    assert.match(result.stderr, /development \| production/)
})
