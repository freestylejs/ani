/** Bundles the bench page from package source (no build step, no ports). */
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

const ALIAS: Record<string, string> = {
    '@freestylejs/ani-core/testing': join(
        REPO_ROOT,
        'packages/core/src/testing/index.ts'
    ),
    '@freestylejs/ani-core': join(REPO_ROOT, 'packages/core/src/index.ts'),
    '@freestylejs/ani-layout': join(REPO_ROOT, 'packages/layout/src/index.ts'),
}

const DEFINE = {
    'process.env.NODE_ENV': '"development"',
}

export async function bundlePage(): Promise<string> {
    const result = await build({
        entryPoints: [join(REPO_ROOT, 'bench/layout/page/index.ts')],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        conditions: ['browser'],
        alias: ALIAS,
        define: DEFINE,
        logLevel: 'silent',
    })
    if (result.warnings.length > 0) {
        throw new Error(
            `bench page warnings:\n${result.warnings
                .map((warning) => warning.text)
                .join('\n')}`
        )
    }
    const output = result.outputFiles?.[0]
    if (!output) throw new Error('esbuild produced no bench page bundle')
    return output.text
}

export function pageHtml(bundle: string, demo?: string): string {
    // An inline module cannot contain a literal </script>.
    const safeBundle = bundle.replace(/<\/script/gi, '<\\/script')
    const demoScript = demo
        ? `<script type="module">
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            for (;;) {
                try { await window.__bench.demo(${JSON.stringify(demo)}); }
                catch (error) { console.error(error); await wait(1000); }
                await wait(300);
            }
        </script>`
        : ''
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ani layout bench</title>
<style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #F2F2F7; }
</style>
</head>
<body>
<script type="module">${safeBundle}</script>
${demoScript}
</body>
</html>`
}
