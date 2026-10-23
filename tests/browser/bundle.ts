import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformAsync } from '@babel/core'
import { type BuildOptions, build, type Plugin, transform } from 'esbuild'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

// The packages are always bundled from source, so no build step is needed.
const ALIAS: Record<string, string> = {
    '@freestylejs/ani-core/testing': join(
        REPO_ROOT,
        'packages/core/src/testing/index.ts'
    ),
    '@freestylejs/ani-core': join(REPO_ROOT, 'packages/core/src/index.ts'),
    '@freestylejs/ani-layout': join(REPO_ROOT, 'packages/layout/src/index.ts'),
    '@freestylejs/ani-react': join(REPO_ROOT, 'packages/react/src/index.ts'),
    '@freestylejs/ani-react/layout': join(
        REPO_ROOT,
        'packages/react/src/layout/index.ts'
    ),
    '@freestylejs/ani-vue': join(REPO_ROOT, 'packages/vue/src/index.ts'),
    '@freestylejs/ani-solid': join(REPO_ROOT, 'packages/solid/src/index.ts'),
    '@freestylejs/ani-svelte': join(REPO_ROOT, 'packages/svelte/src/index.ts'),
}

const DEFINE = {
    'process.env.NODE_ENV': '"development"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
}

/**
 * How a page module is built: against React 18.3 instead of 19, and/or with
 * its `*_fixture.ts` files compiled by the React Compiler (as an app would).
 */
export interface BrowserVariant {
    readonly react18?: boolean
    readonly compiler?: boolean
}

const REACT_18_ALIAS: Record<string, string> = {
    react: 'react-18',
    'react-dom': 'react-dom-18',
}

function reactCompiler(react18: boolean): Plugin {
    return {
        name: 'react-compiler',
        setup(builder) {
            builder.onLoad({ filter: /_fixture\.ts$/ }, async (args) => {
                const source = await readFile(args.path, 'utf8')
                const stripped = await transform(source, {
                    loader: 'ts',
                    format: 'esm',
                })
                const compiled = await transformAsync(stripped.code, {
                    filename: args.path,
                    babelrc: false,
                    configFile: false,
                    plugins: [
                        [
                            'babel-plugin-react-compiler',
                            {
                                target: react18 ? '18' : '19',
                                panicThreshold: 'all_errors',
                            },
                        ],
                    ],
                })
                if (!compiled?.code) {
                    throw new Error(
                        `React Compiler produced no output for ${args.path}`
                    )
                }
                return { contents: compiled.code, loader: 'js' }
            })
        },
    }
}

async function bundle(
    options: BuildOptions,
    variant: BrowserVariant = {}
): Promise<string> {
    const result = await build({
        bundle: true,
        write: false,
        format: 'esm',
        alias: variant.react18 ? { ...ALIAS, ...REACT_18_ALIAS } : ALIAS,
        define: DEFINE,
        logLevel: 'silent',
        plugins: variant.compiler
            ? [reactCompiler(variant.react18 === true)]
            : [],
        ...options,
    })
    if (result.warnings.length > 0) {
        const lines = result.warnings.map((warning) =>
            `${warning.location?.file ?? ''}: ${warning.text}`.trim()
        )
        throw new Error(`esbuild warnings:\n${lines.join('\n')}`)
    }
    const output = result.outputFiles?.[0]
    if (!output) throw new Error('esbuild produced no output')
    return output.text
}

/** Bundles a page-side module (ESM, real browser conditions). */
export function bundleForBrowser(
    entry: string,
    variant: BrowserVariant = {}
): Promise<string> {
    return bundle(
        {
            entryPoints: [entry],
            platform: 'browser',
            conditions: ['browser'],
        },
        variant
    )
}

/**
 * Bundles a Node-side module into one self-contained ESM string, so it can be
 * imported from memory (`data:` URL) without writing a file.
 */
export function bundleForNode(entry: string): Promise<string> {
    return bundle({
        entryPoints: [entry],
        platform: 'node',
        banner: {
            js: `import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(${JSON.stringify(import.meta.url)});`,
        },
    })
}
