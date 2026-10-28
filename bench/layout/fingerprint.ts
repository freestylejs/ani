/**
 * The §11.5 certification-instrument fingerprint. A mismatch anywhere makes
 * the cost gates advisory; the frame-scoring gates still decide.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { cpus, loadavg, totalmem } from 'node:os'
import { join } from 'node:path'
import { chromium, firefox, webkit } from 'playwright'

export interface BrowserBuilds {
    readonly chromium: string
    readonly chromiumHeadlessShell: string
    readonly webkit: string
    readonly firefox: string
}

export interface Fingerprint {
    readonly host: string
    readonly os: { readonly productVersion: string; readonly kernel: string }
    readonly cpu: string
    readonly cores: number
    readonly memoryBytes: number
    readonly node: string
    readonly pnpm: string
    readonly playwright: string
    readonly browsers: BrowserBuilds
    readonly load1: number
}

export interface Advisory {
    readonly cost: boolean
    readonly reasons: readonly string[]
}

const PINNED = {
    host: 'Mac14,9',
    productVersion: '27.0.1',
    kernel: '27.0.0',
    cpu: 'Apple M2 Pro',
    cores: 10,
    memoryBytes: 34359738368,
    node: 'v24.19.0',
    pnpm: '10.20.0',
    playwright: '1.55.0',
    chromium: 'chromium_headless_shell-1187',
    webkit: 'webkit-2203',
    firefox: 'firefox-1490',
    maxLoad1: 1,
} as const

function run(command: string, args: readonly string[]): string {
    try {
        return execFileSync(command, args, { encoding: 'utf8' }).trim()
    } catch {
        return 'unknown'
    }
}

function buildDirectory(executable: string): string {
    const parts = executable.split('/')
    const index = parts.findIndex((part) =>
        /^(chromium|webkit|firefox)(_headless_shell)?-\d+$/.test(part)
    )
    return index >= 0 ? parts[index]! : executable
}

function chromiumBuilds(): { chromium: string; headlessShell: string } {
    const executable = chromium.executablePath()
    const parts = executable.split('/')
    const index = parts.findIndex((part) => /^chromium-\d+$/.test(part))
    if (index < 0)
        return {
            chromium: buildDirectory(executable),
            headlessShell: 'unknown',
        }
    const directory = parts[index]!
    const match = /^chromium-(\d+)$/.exec(directory)!
    const shell = `chromium_headless_shell-${match[1]!}`
    const root = parts.slice(0, index).join('/')
    return {
        chromium: directory,
        headlessShell: existsSync(join(root, shell)) ? shell : 'unknown',
    }
}

export function collectFingerprint(): Fingerprint {
    const chromiumDirs = chromiumBuilds()
    const require = createRequire(import.meta.url)
    const playwrightVersion = (
        require('playwright/package.json') as { version: string }
    ).version
    return {
        host: run('sysctl', ['-n', 'hw.model']),
        os: {
            productVersion: run('sw_vers', ['-productVersion']),
            kernel: run('uname', ['-r']),
        },
        cpu:
            cpus()[0]?.model.trim() ??
            run('sysctl', ['-n', 'machdep.cpu.brand_string']),
        cores: Number(run('sysctl', ['-n', 'hw.ncpu'])) || cpus().length,
        memoryBytes: Number(run('sysctl', ['-n', 'hw.memsize'])) || totalmem(),
        node: process.version,
        pnpm: run('pnpm', ['--version']),
        playwright: playwrightVersion,
        browsers: {
            chromium: chromiumDirs.headlessShell,
            chromiumHeadlessShell: chromiumDirs.headlessShell,
            webkit: buildDirectory(webkit.executablePath()),
            firefox: buildDirectory(firefox.executablePath()),
        },
        load1: loadavg()[0] ?? Number.NaN,
    }
}

export function evaluateFingerprint(fingerprint: Fingerprint): Advisory {
    const reasons: string[] = []
    const check = (name: string, actual: unknown, expected: unknown) => {
        if (actual !== expected) {
            reasons.push(
                `${name} is ${String(actual)}, pinned ${String(expected)}`
            )
        }
    }
    check('host', fingerprint.host, PINNED.host)
    check(
        'os.productVersion',
        fingerprint.os.productVersion,
        PINNED.productVersion
    )
    check('os.kernel', fingerprint.os.kernel, PINNED.kernel)
    check('cpu', fingerprint.cpu, PINNED.cpu)
    check('cores', fingerprint.cores, PINNED.cores)
    check('memoryBytes', fingerprint.memoryBytes, PINNED.memoryBytes)
    check('node', fingerprint.node, PINNED.node)
    check('pnpm', fingerprint.pnpm, PINNED.pnpm)
    check('playwright', fingerprint.playwright, PINNED.playwright)
    check('browsers.chromium', fingerprint.browsers.chromium, PINNED.chromium)
    check('browsers.webkit', fingerprint.browsers.webkit, PINNED.webkit)
    check('browsers.firefox', fingerprint.browsers.firefox, PINNED.firefox)
    if (!(fingerprint.load1 < PINNED.maxLoad1)) {
        reasons.push(
            `1-minute load is ${fingerprint.load1.toFixed(2)}, pinned below ${PINNED.maxLoad1}`
        )
    }
    return { cost: reasons.length > 0, reasons }
}

export const PINNED_FINGERPRINT = PINNED
