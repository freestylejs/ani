import { defineConfig } from 'tsup'

export default defineConfig((options) => ({
    entry: {
        index: 'src/index.ts',
        values: 'src/values/index.ts',
    },
    watch: options.watch ? ['src/**/*'] : false,
    clean: false,
    // one shared chunk per format, so `AniError` is a single class in cjs too
    splitting: true,
    dts: true,
    outDir: 'dist',
    // noExternal: [],
    target: 'esnext',
    format: ['cjs', 'esm'],
    sourcemap: false,
}))
