import { defineConfig } from "tsup"

export default defineConfig({
    entry: {
        index: "src/index.ts",
        cli: "src/cli.ts",
    },
    clean: false,
    dts: true,
    outDir: "dist",
    target: "es2022",
    format: ["esm"],
    sourcemap: false,
})
