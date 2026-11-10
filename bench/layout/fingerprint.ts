/**
 * The §11.5 certification-instrument fingerprint. Under D13 (2026-10-30) a
 * hardware/software mismatch makes the cost gates advisory; the recorded
 * 1-minute load is separate evidence and a load above the retired D9 pin is
 * controlled-load evidence, not an advisory reason.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { cpus, loadavg, totalmem } from 'node:os'
import { join } from 'node:path'
import { chromium, firefox, webkit } from 'playwright'

const SOURCE_IDENTITY_ROOTS = [
    'packages',
    'tests/browser',
    'tests/release',
    'bench/layout',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'turbo.json',
    'tsconfig.json',
] as const

function sourceIdentityPath(path: string): boolean {
    if (
        path.endsWith('.log') ||
        path.startsWith('.trace/') ||
        path.includes('/.trace/') ||
        path.startsWith('results/') ||
        path.includes('/results/') ||
        path.startsWith('bench/layout/iteration-') ||
        path.startsWith('bench/layout/results/')
    ) {
        return false
    }
    if (
        path.includes('/node_modules/') ||
        path.includes('/dist/') ||
        path.includes('/.turbo/') ||
        path.includes('/.source/')
    ) {
        return false
    }
    return true
}

/**
 * Exact current source-state identity for qualification provenance.
 *
 * The digest uses working-tree bytes for tracked and untracked source/tooling
 * inputs, so two dirty trees at the same HEAD cannot share an identity.
 * Historical benchmark/output directories are excluded, including the
 * protected user-owned bench/layout/iteration-13 evidence.
 */
export function collectSourceIdentity(repoRoot: string): string | undefined {
    let head: string
    let listed: string
    try {
        head = execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: repoRoot,
            encoding: 'utf8',
        }).trim()
        listed = execFileSync(
            'git',
            [
                'ls-files',
                '-z',
                '--cached',
                '--others',
                '--exclude-standard',
                '--',
                ...SOURCE_IDENTITY_ROOTS,
            ],
            {
                cwd: repoRoot,
                encoding: 'utf8',
            }
        )
    } catch {
        return undefined
    }
    if (head.length === 0) return undefined

    const files = listed
        .split('\0')
        .filter((path) => path.length > 0 && sourceIdentityPath(path))
        .sort()
    const hash = createHash('sha256')
    for (const path of files) {
        hash.update(path)
        hash.update('\0')
        try {
            const bytes = readFileSync(join(repoRoot, path))
            // Frame present bytes separately from an absent tracked input.
            // Literal source contents must never collide with a deletion marker.
            hash.update(`file:${bytes.byteLength}\0`)
            hash.update(bytes)
        } catch (error) {
            if (
                !(error instanceof Error) ||
                !('code' in error) ||
                error.code !== 'ENOENT'
            )
                return undefined
            hash.update('missing\0')
        }
        hash.update('\0')
    }
    return `${head}+source-sha256:${hash.digest('hex')}`
}

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
    /** True only for a hardware/software fingerprint mismatch. */
    readonly cost: boolean
    /** Hard fingerprint mismatches. Load is never one of these (D13). */
    readonly reasons: readonly string[]
    /** The recorded 1-minute load, exactly as measured. */
    readonly load1: number
    /** D13: load above the retired D9 <1.0 pin is controlled-load evidence. */
    readonly controlledLoad: boolean
    /** Human-readable load evidence; never a cost-advisory reason. */
    readonly loadReason: string
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
} as const

/**
 * D9's quiet-host pin. It is retired: D13 records load above it as
 * controlled-load evidence rather than an advisory/failure reason.
 */
const D9_LOAD_PIN = 1

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
    // Firefox is advisory (D9); its build is recorded but never decides a
    // Chromium/WebKit cost gate (H14-32).
    //
    // D13: the retired D9 <1.0 load pin is not a fingerprint check. Record the
    // load and whether it is controlled-load evidence; never make a cost row
    // advisory because of it.
    const load1 = fingerprint.load1
    const controlledLoad = Number.isFinite(load1) && load1 > D9_LOAD_PIN
    const loadReason = Number.isFinite(load1)
        ? controlledLoad
            ? `above the retired D9 <${D9_LOAD_PIN.toFixed(1)} pin; recorded as controlled-load evidence (D13), not an advisory reason`
            : `within the retired D9 <${D9_LOAD_PIN.toFixed(1)} pin`
        : 'unavailable (the 1-minute load could not be read)'
    return {
        cost: reasons.length > 0,
        reasons,
        load1,
        controlledLoad,
        loadReason,
    }
}

export const PINNED_FINGERPRINT = PINNED
