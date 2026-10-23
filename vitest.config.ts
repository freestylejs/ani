import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

const packageFloor = {
    statements: 92,
    branches: 85,
    functions: 90,
    lines: 92,
}

export default defineConfig({
    root: process.cwd(),
    plugins: [tsconfigPaths()],
    test: {
        root: 'packages',
        coverage: {
            provider: 'v8',
            reporter: ['html', 'text', 'json-summary'],
            // Count every source file (unloaded ones as 0%), never build output.
            include: ['*/src/**/*.{ts,tsx}'],
            exclude: [
                '**/dist/**',
                '**/__tests__/**',
                '**/*.test.{ts,tsx}',
                '**/index.ts',
                '**/types.ts',
                '**/*_types.ts',
                '**/binding_api.ts',
                '**/utils/types/**',
                'web/**',
                // the layout DOM engine needs real layout: its coverage is
                // gated in Chromium (`pnpm test:browser --coverage`,
                // tests/browser/coverage.ts)
                'layout/src/scope.ts',
                'layout/src/dom.ts',
                'layout/src/realize/**',
            ],
            // Floors set a few points below the measured values (v1 hardening:
            // overall 94.3 / 86.5 / 95.1 / 95.0; bindings >= 97.7 / 84.6 /
            // 95.5 / 98.3), so regressions fail CI but noise does not.
            thresholds: {
                statements: 92,
                branches: 85,
                functions: 90,
                lines: 92,
                'core/src/**': packageFloor,
                'react/src/**': {
                    statements: 85,
                    branches: 70,
                    functions: 85,
                    lines: 89,
                },
                'react/src/ani/**': packageFloor,
                'react/src/layout/**': {
                    statements: 85,
                    branches: 70,
                    functions: 85,
                    lines: 89,
                },
                'layout/src/**': {
                    statements: 85,
                    branches: 78,
                    functions: 90,
                    lines: 90,
                },
                'vue/src/**': packageFloor,
                'solid/src/**': packageFloor,
                'svelte/src/**': packageFloor,
            },
        },
    },
    resolve: {
        alias: {
            // Binding tests run against core *source*, so they never depend on a
            // stale/missing git-ignored `core/dist` (no build-order coupling).
            '@freestylejs/ani-core': fileURLToPath(
                new URL('./packages/core/src/index.ts', import.meta.url)
            ),
            '@freestylejs/ani-layout': fileURLToPath(
                new URL('./packages/layout/src/index.ts', import.meta.url)
            ),
            react: fileURLToPath(new URL('./node_modules/react', import.meta.url)),
            'react/jsx-runtime': fileURLToPath(
                new URL('./node_modules/react/jsx-runtime.js', import.meta.url)
            ),
            'react/jsx-dev-runtime': fileURLToPath(
                new URL(
                    './node_modules/react/jsx-dev-runtime.js',
                    import.meta.url
                )
            ),
            'solid-js': fileURLToPath(
                new URL('./node_modules/solid-js/dist/solid.js', import.meta.url)
            ),
            'solid-js/web': fileURLToPath(
                new URL(
                    './node_modules/solid-js/web/dist/web.js',
                    import.meta.url
                )
            ),
        },
    },
})
