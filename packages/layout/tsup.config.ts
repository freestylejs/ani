import { defineConfig } from 'tsup'

export default defineConfig({
    entry: {
        index: 'src/index.ts',
    },
    clean: true,
    dts: true,
    outDir: 'dist',
    target: 'esnext',
    format: ['cjs', 'esm'],
    sourcemap: false,
})
