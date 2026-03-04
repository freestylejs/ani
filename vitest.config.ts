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
    resolve: {},
})
