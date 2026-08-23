import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    root: process.cwd(),
    plugins: [tsconfigPaths()],
    test: {
        root: 'packages',
        coverage: {
            reporter: ['html', 'text'],
            provider: 'v8',
        },
    },
    resolve: {
        alias: {
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
