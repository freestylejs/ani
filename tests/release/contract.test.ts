import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

interface Manifest {
    name: string
    version: string
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

const manifest = async (name: string): Promise<Manifest> =>
    JSON.parse(
        await readFile(
            new URL(`../../packages/${name}/package.json`, import.meta.url),
            'utf8'
        )
    ) as Manifest

// This is the ABI boundary, not a requirement to remove valid core timing APIs.
// The new adapter cannot mount against the old symbol-only layout release.
test('the native-layout release pair excludes the symbol-only layout ABI', async () => {
    const [layout, react] = await Promise.all([
        manifest('layout'),
        manifest('react'),
    ])
    assert.equal(layout.version, '0.2.0')
    assert.equal(layout.peerDependencies?.['@freestylejs/ani-core'], '^2.0.0')
    assert.equal(react.version, '2.0.0')
    assert.equal(react.peerDependencies?.['@freestylejs/ani-layout'], '^0.2.0')
    assert.equal(
        react.peerDependenciesMeta?.['@freestylejs/ani-layout']?.optional,
        true,
        'the base React entry must still work without the layout entry'
    )
})

test('the release carries immutable core inputs and the showcase installs its layout peer', async () => {
    const [core, web] = await Promise.all([manifest('core'), manifest('web')])
    assert.equal(core.version, '2.0.0')
    assert.equal(web.dependencies?.['@freestylejs/ani-layout'], 'workspace:^')
})

// Source tests use the repository's exact-optional configuration. Consumers do
// not have to, and emitted declarations must work with strict checks in both.
for (const exactOptionalPropertyTypes of [false, true]) {
    test(`built ESM/CJS declarations support strict consumers (exact optional: ${exactOptionalPropertyTypes})`, () => {
        const roots = [
            'core/dist/index.d.ts',
            'core/dist/index.d.cts',
            'layout/dist/index.d.ts',
            'layout/dist/index.d.cts',
            'react/dist/layout.d.ts',
            'react/dist/layout.d.cts',
        ].map((path) =>
            fileURLToPath(new URL(`../../packages/${path}`, import.meta.url))
        )
        const program = ts.createProgram(roots, {
            noEmit: true,
            strict: true,
            skipLibCheck: false,
            exactOptionalPropertyTypes,
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.NodeNext,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            types: [],
        })
        const diagnostics = ts.getPreEmitDiagnostics(program)
        assert.equal(
            diagnostics.length,
            0,
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCanonicalFileName: (file) => file,
                getCurrentDirectory: () => process.cwd(),
                getNewLine: () => '\n',
            })
        )
    })
}
