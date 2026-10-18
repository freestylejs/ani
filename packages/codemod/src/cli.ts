#!/usr/bin/env node
import { run } from './run'

process.exitCode = run(process.argv.slice(2), {
    log: (line) => process.stdout.write(`${line}\n`),
    error: (line) => process.stderr.write(`${line}\n`),
})
