import { defineConfig } from 'tsup'

const entry = {
    index: 'src/index.ts',
    values: 'src/values/index.ts',
    testing: 'src/testing/index.ts',
}

export default defineConfig((options) => [
    {
        entry,
        watch: options.watch ? ['src/**/*'] : false,
        clean: true,
        // one shared chunk per format, so `AniError` is a single class in cjs too
        splitting: true,
        dts: true,
        outDir: 'dist',
        target: 'esnext',
        format: ['cjs', 'esm'],
        sourcemap: false,
        // production: DEV folds to false, long error text is removed
        define: { __ANI_DEV__: 'false' },
    },
    {
        entry,
        watch: options.watch ? ['src/**/*'] : false,
        clean: false,
        splitting: true,
        dts: false,
        outDir: 'dist/dev',
        target: 'esnext',
        format: ['cjs', 'esm'],
        sourcemap: false,
        // development: DEV is true, every message and warning is kept
        define: { __ANI_DEV__: 'true' },
    },
])
