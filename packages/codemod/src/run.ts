import { readFileSync, writeFileSync } from 'node:fs'
import { transform } from './transform'
import { collectFiles } from './walk'

export interface Output {
    log(line: string): void
    error(line: string): void
}

const USAGE = 'Usage: ani-codemod [--dry] <file-or-dir>...'

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

/** Runs the codemod CLI; returns the process exit code. */
export function run(args: string[], out: Output): number {
    const unknown = args.find((a) => a.startsWith('-') && a !== '--dry')
    const targets = args.filter((a) => !a.startsWith('-'))
    if (unknown || targets.length === 0) {
        out.error(unknown ? `Unknown option ${unknown}\n${USAGE}` : USAGE)
        return 1
    }
    const dry = args.includes('--dry')

    let files: string[]
    try {
        files = collectFiles(targets)
    } catch (error) {
        out.error(describe(error))
        return 1
    }

    let changed = 0
    let warned = 0
    let failed = false
    for (const file of files) {
        try {
            const source = readFileSync(file, 'utf8')
            const result = transform(source, file)
            if (result.code !== source) {
                if (!dry) writeFileSync(file, result.code)
                changed++
            }
            for (const w of result.warnings) {
                out.log(
                    `${file}:${w.line}:${w.column} [${w.rule}] ${w.message}`
                )
                warned++
            }
        } catch (error) {
            out.error(`${file}: ${describe(error)}`)
            failed = true
        }
    }
    out.log(`${changed} files changed, ${warned} warnings`)
    return failed ? 1 : 0
}
