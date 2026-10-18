import { readdirSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { SUPPORTED_EXTENSIONS } from './transform'

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.git', '.next'])

/**
 * Expands files and directories into the supported files below them, in a
 * stable order. Throws when a path does not exist.
 */
export function collectFiles(paths: string[]): string[] {
    // Keyed by absolute path so one file reached twice is transformed once.
    const files = new Map<string, string>()
    const add = (file: string): void => {
        const key = resolve(file)
        if (SUPPORTED_EXTENSIONS.includes(extname(file)) && !files.has(key))
            files.set(key, file)
    }
    const walk = (dir: string): void => {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries.sort((a, b) =>
            a.name < b.name ? -1 : 1
        )) {
            if (entry.isDirectory()) {
                if (!SKIPPED_DIRECTORIES.has(entry.name))
                    walk(join(dir, entry.name))
            } else if (entry.isFile()) {
                add(join(dir, entry.name))
            }
        }
    }
    for (const path of paths) {
        if (statSync(path).isDirectory()) walk(path)
        else add(path)
    }
    return [...files.values()]
}
