// @vitest-environment jsdom
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as core from '../../index'
import * as testing from '../../testing/index'
import * as values from '../../values/index'
import { type ExtractedFence, extractDocsFences } from './extractor'

interface FakeEffect {
    target: Element
    keyframes: readonly unknown[]
    options: KeyframeEffectOptions
}

class FakeKeyframeEffect {
    public readonly target: Element
    public readonly keyframes: readonly unknown[]
    public readonly options: KeyframeEffectOptions

    public constructor(
        target: Element,
        keyframes: readonly unknown[],
        options: KeyframeEffectOptions
    ) {
        this.target = target
        this.keyframes = keyframes
        this.options = options
    }
}

class FakeAnimation {
    public readonly effect: FakeEffect
    public readonly timeline: unknown
    public currentTime: number | null = null
    public playState: AnimationPlayState = 'idle'
    public playbackRate = 1
    private readonly _finished: Promise<void>
    private _resolveFinished!: () => void
    private _rejectFinished!: (reason: unknown) => void

    public constructor(effect: FakeEffect, timeline: unknown) {
        this.effect = effect
        this.timeline = timeline
        this._finished = new Promise<void>((resolve, reject) => {
            this._resolveFinished = resolve
            this._rejectFinished = reject
        })
        this._finished.catch(() => undefined)
    }

    public get finished(): Promise<void> {
        return this._finished
    }

    public commitStyles(): void {
        /* noop */
    }

    public play(): void {
        this.playState = 'running'
    }

    public pause(): void {
        this.playState = 'paused'
    }

    public cancel(): void {
        this.playState = 'idle'
        this._rejectFinished(new Error('animation canceled'))
    }

    public finish(): void {
        this.playState = 'finished'
        this._resolveFinished()
    }
}

const MAX_OPT_OUTS = 5
const TYPECHECK_TIMEOUT_MS = 60_000
const INITIAL_FRAME_TIME = 1000
const TWO_SECONDS_FRAMES = 120
const FRAME_STEP_MS = 16.666

describe('P3B: every docs code example is a test', () => {
    const repoRoot = resolve(__dirname, '../../../../..')
    const fences = extractDocsFences(repoRoot)
    const runnableFences = fences.filter((f) => f.isCoreOnly)

    it('enforces opt-out budget and reports all opt-outs', () => {
        const optOuts = fences.filter((f) => f.nocheck !== undefined)
        for (const opt of optOuts) {
            // Requirement 5: list every opt-out in its output
            process.stdout.write(
                `[opt-out] ${opt.filePath}:${opt.fenceLine} (${opt.info}) reason: ${opt.nocheck}\n`
            )
        }
        expect(optOuts.length).toBeLessThanOrEqual(MAX_OPT_OUTS)
    })

    it(
        'type-checks every ts / typescript / tsx / vue / svelte fence in ONE ts.Program',
        () => {
            const checkableFences = fences.filter(
                (f) => f.nocheck === undefined
            )
            const ambientFile = resolve(__dirname, 'ambient.d.ts')
            const virtualMap = new Map<string, string>()

            for (const fence of checkableFences) {
                virtualMap.set(fence.virtualPath, fence.virtualCode)
            }

            const compilerOptions: ts.CompilerOptions = {
                strict: true,
                target: ts.ScriptTarget.ES2021,
                module: ts.ModuleKind.ESNext,
                moduleResolution: ts.ModuleResolutionKind.Bundler,
                lib: [
                    'lib.dom.d.ts',
                    'lib.dom.iterable.d.ts',
                    'lib.esnext.d.ts',
                ],
                ignoreDeprecations: '6.0',
                baseUrl: repoRoot,
                paths: {
                    '@freestylejs/ani-core': [
                        resolve(repoRoot, 'packages/core/src/index.ts'),
                    ],
                    '@freestylejs/ani-core/testing': [
                        resolve(repoRoot, 'packages/core/src/testing/index.ts'),
                    ],
                    '@freestylejs/ani-core/values': [
                        resolve(repoRoot, 'packages/core/src/values/index.ts'),
                    ],
                    '@freestylejs/ani-react': [
                        resolve(repoRoot, 'packages/react/src/index.ts'),
                    ],
                    '@freestylejs/ani-vue': [
                        resolve(repoRoot, 'packages/vue/src/index.ts'),
                    ],
                    '@freestylejs/ani-solid': [
                        resolve(repoRoot, 'packages/solid/src/index.ts'),
                    ],
                    '@freestylejs/ani-svelte': [
                        resolve(repoRoot, 'packages/svelte/src/index.ts'),
                    ],
                    '~/*': [resolve(repoRoot, 'packages/core/src/*')],
                },
                noEmit: true,
                skipLibCheck: true,
                jsx: ts.JsxEmit.ReactJSX,
                allowJs: true,
                checkJs: true,
            }

            const host = ts.createCompilerHost(compilerOptions)
            const originalGetSourceFile = host.getSourceFile
            host.getSourceFile = (
                fileName,
                languageVersion,
                onError,
                shouldCreateNewSourceFile
            ) => {
                const normalized = resolve(fileName)
                if (virtualMap.has(normalized)) {
                    return ts.createSourceFile(
                        normalized,
                        virtualMap.get(normalized)!,
                        languageVersion
                    )
                }
                return originalGetSourceFile(
                    fileName,
                    languageVersion,
                    onError,
                    shouldCreateNewSourceFile
                )
            }

            const originalFileExists = host.fileExists
            host.fileExists = (fileName) => {
                const normalized = resolve(fileName)
                if (virtualMap.has(normalized)) return true
                return originalFileExists(fileName)
            }

            const originalReadFile = host.readFile
            host.readFile = (fileName) => {
                const normalized = resolve(fileName)
                if (virtualMap.has(normalized))
                    return virtualMap.get(normalized)
                return originalReadFile(fileName)
            }

            const program = ts.createProgram({
                rootNames: [ambientFile, ...virtualMap.keys()],
                options: compilerOptions,
                host,
            })

            const diagnostics: string[] = []
            for (const fence of checkableFences) {
                const sf = program.getSourceFile(fence.virtualPath)
                if (!sf) {
                    diagnostics.push(
                        `${fence.filePath}:${fence.codeLine}: Virtual source file not found: ${fence.virtualPath}`
                    )
                    continue
                }
                const diags: readonly ts.Diagnostic[] = [
                    ...program.getSyntacticDiagnostics(sf),
                    ...program.getSemanticDiagnostics(sf),
                ]
                for (const d of diags) {
                    const pos =
                        d.start === undefined
                            ? undefined
                            : sf.getLineAndCharacterOfPosition(d.start)
                    const line = pos ? pos.line + 1 : fence.codeLine
                    const col = pos ? pos.character + 1 : 1
                    const msg = ts.flattenDiagnosticMessageText(
                        d.messageText,
                        '\n'
                    )
                    diagnostics.push(`${fence.filePath}:${line}:${col} ${msg}`)
                }
            }

            expect(diagnostics).toEqual([])
        },
        TYPECHECK_TIMEOUT_MS
    )

    describe('run core examples', () => {
        let frameTime = INITIAL_FRAME_TIME
        const pendingCallbacks = new Map<number, (timestamp: number) => void>()
        let nextCallbackId = 1

        const customRequire = (spec: string): unknown => {
            if (spec === '@freestylejs/ani-core') return core
            if (spec === '@freestylejs/ani-core/testing') return testing
            if (spec === '@freestylejs/ani-core/values') return values
            throw new Error(`Unexpected import in core runner: ${spec}`)
        }

        beforeEach(() => {
            frameTime = INITIAL_FRAME_TIME
            pendingCallbacks.clear()
            nextCallbackId = 1
            testing.resetDefaultClock()

            vi.spyOn(console, 'log').mockImplementation(() => {
                /* noop */
            })
            vi.spyOn(console, 'warn').mockImplementation(() => {
                /* noop */
            })

            const mockRaf = (cb: (timestamp: number) => void): number => {
                const id = nextCallbackId++
                pendingCallbacks.set(id, cb)
                return id
            }
            const mockCaf = (id: number): void => {
                pendingCallbacks.delete(id)
            }

            window.requestAnimationFrame = mockRaf
            window.cancelAnimationFrame = mockCaf
            window.performance.now = () => frameTime

            const mediaMock = (query: string): MediaQueryList =>
                ({
                    matches: false,
                    media: query,
                    onchange: null,
                    addListener: () => {
                        /* noop */
                    },
                    removeListener: () => {
                        /* noop */
                    },
                    addEventListener: () => {
                        /* noop */
                    },
                    removeEventListener: () => {
                        /* noop */
                    },
                    dispatchEvent: () => false,
                }) as unknown as MediaQueryList

            window.matchMedia = mediaMock

            const globalAny = globalThis as unknown as Record<string, unknown>
            globalAny.KeyframeEffect = FakeKeyframeEffect
            globalAny.Animation = FakeAnimation
            const winAny = window as unknown as Record<string, unknown>
            winAny.KeyframeEffect = FakeKeyframeEffect
            winAny.Animation = FakeAnimation

            document.body.innerHTML =
                '<div class="card"></div><div class="card"></div><div class="hero"></div><div class="list"></div>'

            globalAny.element = document.createElement('div')
            globalAny.scroller = document.createElement('div')
            globalAny.items = [
                document.createElement('div'),
                document.createElement('div'),
                document.createElement('div'),
            ]
            globalAny.container = document.createElement('div')
            globalAny.box = document.createElement('div')
        })

        afterEach(() => {
            testing.resetDefaultClock()
            vi.restoreAllMocks()
        })

        it.each(
            runnableFences
        )('$filePath:$codeLine ($sourceLang)', async (fence: ExtractedFence) => {
            const transpiled = ts.transpileModule(fence.rawCode, {
                compilerOptions: {
                    module: ts.ModuleKind.CommonJS,
                    target: ts.ScriptTarget.ES2021,
                    strict: true,
                },
            }).outputText

            let thrownError: unknown = undefined
            let unhandledRejection: unknown = undefined
            const rejectionHandler = (reason: unknown) => {
                unhandledRejection = reason
            }
            process.on('unhandledRejection', rejectionHandler)

            try {
                const exportsObj = {}
                const fn = vm.runInThisContext(
                    `(async function(exports, require) {\n${transpiled}\n})`,
                    { filename: `${fence.filePath}:${fence.codeLine}` }
                )
                const res = fn(exportsObj, customRequire)
                const promise = Promise.resolve(res)
                promise.catch((err: unknown) => {
                    if (thrownError === undefined) thrownError = err
                })

                // Drive 2 s of frames (120 frames at ~16.6ms)
                for (let i = 0; i < TWO_SECONDS_FRAMES; i++) {
                    frameTime += FRAME_STEP_MS
                    const cbs = [...pendingCallbacks.values()]
                    pendingCallbacks.clear()
                    for (const cb of cbs) cb(frameTime)
                    await new Promise<void>((r) => {
                        queueMicrotask(() => {
                            r()
                        })
                    })
                }

                if (
                    unhandledRejection !== undefined &&
                    thrownError === undefined
                ) {
                    thrownError = unhandledRejection
                }
            } catch (err) {
                thrownError = err
            } finally {
                process.off('unhandledRejection', rejectionHandler)
            }

            if (fence.throws) {
                expect(
                    thrownError,
                    `Expected fence at ${fence.filePath}:${fence.codeLine} to throw AniError`
                ).toBeDefined()
                expect(core.isAniError(thrownError)).toBe(true)
            } else {
                expect(
                    thrownError,
                    `Unexpected error in ${fence.filePath}:${fence.codeLine}: ${String(thrownError)}`
                ).toBeUndefined()
            }

            testing.resetDefaultClock()
            expect(core.defaultClock.size).toBe(0)
        })
    })
})
