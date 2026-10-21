import { defineConfig } from 'tsup'

export default defineConfig((options) => [
    {
        entry: {
            index: 'src/index.ts',
        },
        watch: options.watch ? ['src/**/*'] : false,
        clean: false,
        dts: true,
        outDir: 'dist',
        target: 'esnext',
        format: ['cjs', 'esm'],
        sourcemap: false,
    },
    {
        entry: {
            layout: 'src/layout/index.ts',
        },
        watch: options.watch ? ['src/layout/**/*'] : false,
        clean: false,
        dts: true,
        outDir: 'dist',
        target: 'esnext',
        format: ['cjs', 'esm'],
        sourcemap: false,
        banner: {
            js: "'use client';",
        },
    },
])
