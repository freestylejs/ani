/**
 * Native-grade qualification is deliberately separate from the existing
 * geometry/script benchmark certification. It cannot turn browser DOM/rAF
 * observations into physical-device evidence.
 */

export type QualificationStatus = 'pass' | 'fail' | 'block'

export interface QualificationBuild {
    /** null is historical/unavailable provenance and can only BLOCK. */
    readonly revision: string | null
    readonly artifact: string
    readonly mode: 'development' | 'production'
}

export interface QualificationDimensionInput {
    readonly status: QualificationStatus
    readonly detail: string
}

export interface BrowserProxyEvidence {
    readonly build: QualificationBuild
    readonly browser: string
    readonly os: string
    readonly dpr: number
    readonly rafSamples: number
    readonly rafMedianMs: number
    readonly rafP95Ms: number
    readonly rafMaxMs: number
    readonly eventToDomSamples: number
    readonly eventToDomMs: number
    readonly scene: string
    readonly load1: number
}

export interface PhysicalMeasurementEvidence {
    /** Whether a real measurement was performed. */
    readonly measured: boolean
    /** Whether the submitted observation was accepted by its stated criterion. */
    readonly accepted: boolean
    /** Explicit acceptance outcome; never inferred from method/result prose. */
    readonly outcome: 'pass' | 'fail' | null
    readonly method: string
    /** Actual observation/result that was assessed. */
    readonly result: string
}

export interface PhysicalDeviceEvidence {
    readonly build: QualificationBuild
    /** Only a real iOS Safari device can satisfy the physical rows. */
    readonly platform: 'ios-safari'
    /** Model/class only; no serial number, UDID or user-assigned device name. */
    readonly deviceModel: string
    readonly osVersion: string
    readonly browserVersion: string
    readonly presentation: PhysicalMeasurementEvidence
    readonly input: PhysicalMeasurementEvidence
}

export interface NativeGradeQualificationInput {
    readonly build: QualificationBuild
    readonly geometry: QualificationDimensionInput
    readonly script: QualificationDimensionInput
    readonly browserProxy: BrowserProxyEvidence | null
    readonly physicalDevice: PhysicalDeviceEvidence | null
    readonly content: QualificationDimensionInput
}

export interface QualificationDimension {
    readonly status: QualificationStatus
    readonly detail: string
}

export interface NativeGradeQualificationResult {
    readonly status: QualificationStatus
    readonly nativeDeviceQualified: boolean
    readonly dimensions: {
        readonly geometry: QualificationDimension
        readonly script: QualificationDimension
        readonly browserProxy: QualificationDimension
        readonly actualPresentation: QualificationDimension
        readonly physicalInput: QualificationDimension
        readonly content: QualificationDimension
    }
    readonly reasons: readonly string[]
}

function sameBuild(a: QualificationBuild, b: QualificationBuild): boolean {
    return (
        a.revision === b.revision &&
        a.artifact === b.artifact &&
        a.mode === b.mode
    )
}

function nonBlank(value: unknown): value is string {
    return (
        typeof value === 'string' && value.length > 0 && value === value.trim()
    )
}

function validBuild(build: QualificationBuild): boolean {
    return (
        nonBlank(build.revision) &&
        nonBlank(build.artifact) &&
        (build.mode === 'development' || build.mode === 'production')
    )
}

function unavailableBuild(build: QualificationBuild): boolean {
    return (
        build.revision === null &&
        nonBlank(build.artifact) &&
        (build.mode === 'development' || build.mode === 'production')
    )
}

function positiveInteger(value: number): boolean {
    return Number.isFinite(value) && Number.isInteger(value) && value > 0
}

function finiteNonNegative(value: number): boolean {
    return Number.isFinite(value) && value >= 0
}

function dimension(
    status: QualificationStatus,
    detail: string
): QualificationDimension {
    if (status !== 'pass' && status !== 'fail' && status !== 'block') {
        return {
            status: 'fail',
            detail: 'submitted qualification dimension status is malformed',
        }
    }
    return { status, detail }
}

function browserProxyDimension(
    expected: QualificationBuild,
    evidence: BrowserProxyEvidence | null
): QualificationDimension {
    if (unavailableBuild(expected)) {
        return dimension(
            'block',
            'qualification source revision is unavailable, so browser proxy build identity cannot be matched'
        )
    }
    if (!validBuild(expected)) {
        return dimension(
            'fail',
            'qualification build identity is blank or malformed'
        )
    }
    if (evidence === null) {
        return dimension(
            'block',
            'browser proxy evidence missing: production-path real-rAF cadence and event-to-DOM response were not measured'
        )
    }
    if (!validBuild(evidence.build)) {
        return dimension(
            'fail',
            'browser proxy build identity is blank or malformed'
        )
    }
    if (expected.mode !== 'production') {
        return dimension(
            'fail',
            'browser proxy build is not the required production source build'
        )
    }
    if (!sameBuild(expected, evidence.build)) {
        return dimension(
            'fail',
            'browser proxy build does not match the qualification build identity'
        )
    }
    if (
        !nonBlank(evidence.browser) ||
        !nonBlank(evidence.os) ||
        !nonBlank(evidence.scene) ||
        !Number.isFinite(evidence.dpr) ||
        evidence.dpr <= 0 ||
        !finiteNonNegative(evidence.load1)
    ) {
        return dimension(
            'fail',
            'browser proxy environment/scene/load metadata is invalid'
        )
    }
    if (
        !positiveInteger(evidence.rafSamples) ||
        !positiveInteger(evidence.eventToDomSamples)
    ) {
        return dimension(
            'fail',
            'browser proxy sample counts must be finite positive integers'
        )
    }
    if (
        !Number.isFinite(evidence.rafMedianMs) ||
        evidence.rafMedianMs <= 0 ||
        !Number.isFinite(evidence.rafP95Ms) ||
        evidence.rafP95Ms <= 0 ||
        !Number.isFinite(evidence.rafMaxMs) ||
        evidence.rafMaxMs <= 0 ||
        !finiteNonNegative(evidence.eventToDomMs)
    ) {
        return dimension(
            'fail',
            'browser proxy cadence/event-to-DOM observations must be finite'
        )
    }
    return dimension(
        'pass',
        `${evidence.browser}; ${evidence.os}; DPR ${evidence.dpr}; scene ${evidence.scene}; load1 ${evidence.load1}; ${evidence.rafSamples} rAF intervals (median ${evidence.rafMedianMs} ms, p95 ${evidence.rafP95Ms} ms, max ${evidence.rafMaxMs} ms); ${evidence.eventToDomSamples} event-to-DOM sample(s), observed ${evidence.eventToDomMs} ms; proxy only`
    )
}

function physicalMeasurementDimension(
    label: 'presentation' | 'input',
    evidence: PhysicalMeasurementEvidence
): QualificationDimension {
    if (typeof evidence.measured !== 'boolean') {
        return dimension('fail', `physical ${label} measured flag is malformed`)
    }
    if (!evidence.measured) {
        return dimension('block', `physical ${label} was not measured`)
    }
    if (
        !nonBlank(evidence.method) ||
        !nonBlank(evidence.result) ||
        (evidence.outcome !== 'pass' && evidence.outcome !== 'fail') ||
        evidence.accepted !== (evidence.outcome === 'pass')
    ) {
        return dimension(
            'fail',
            `physical ${label} evidence is measured but its method/result/accepted outcome is malformed`
        )
    }
    if (evidence.outcome === 'fail') {
        return dimension(
            'fail',
            `physical ${label} failed its submitted acceptance criterion: ${evidence.result}; method: ${evidence.method}`
        )
    }
    return dimension(
        'pass',
        `physical ${label} accepted: ${evidence.result}; method: ${evidence.method}`
    )
}

function physicalDimensions(
    expected: QualificationBuild,
    evidence: PhysicalDeviceEvidence | null
): {
    presentation: QualificationDimension
    input: QualificationDimension
} {
    if (unavailableBuild(expected)) {
        const detail =
            'qualification source revision is unavailable, so physical evidence build identity cannot be matched'
        return {
            presentation: dimension('block', detail),
            input: dimension('block', detail),
        }
    }
    if (!validBuild(expected)) {
        const detail = 'qualification build identity is blank or malformed'
        return {
            presentation: dimension('fail', detail),
            input: dimension('fail', detail),
        }
    }
    if (evidence === null) {
        return {
            presentation: dimension(
                'block',
                'no real iOS Safari presentation evidence is available'
            ),
            input: dimension(
                'block',
                'no real iOS Safari physical-input evidence is available'
            ),
        }
    }

    if (
        !validBuild(evidence.build) ||
        expected.mode !== 'production' ||
        !sameBuild(expected, evidence.build)
    ) {
        const detail =
            'physical device evidence build does not match the production qualification build identity'
        return {
            presentation: dimension('fail', detail),
            input: dimension('fail', detail),
        }
    }
    if (evidence.platform !== 'ios-safari') {
        const detail =
            'physical evidence is not from real iOS Safari; desktop WebKit cannot satisfy this row'
        return {
            presentation: dimension('fail', detail),
            input: dimension('fail', detail),
        }
    }
    if (
        !nonBlank(evidence.deviceModel) ||
        !nonBlank(evidence.osVersion) ||
        !nonBlank(evidence.browserVersion)
    ) {
        const detail = 'physical device/browser metadata is incomplete'
        return {
            presentation: dimension('fail', detail),
            input: dimension('fail', detail),
        }
    }

    const decorate = (
        value: QualificationDimension
    ): QualificationDimension => ({
        ...value,
        detail: `${evidence.deviceModel}; ${evidence.osVersion}; ${evidence.browserVersion}; ${value.detail}`,
    })
    const presentation = decorate(
        physicalMeasurementDimension('presentation', evidence.presentation)
    )
    const input = decorate(
        physicalMeasurementDimension('input', evidence.input)
    )

    return { presentation, input }
}

export function qualifyNativeGrade(
    input: NativeGradeQualificationInput
): NativeGradeQualificationResult {
    const physical = physicalDimensions(input.build, input.physicalDevice)
    const dimensions = {
        geometry: dimension(input.geometry.status, input.geometry.detail),
        script: dimension(input.script.status, input.script.detail),
        browserProxy: browserProxyDimension(input.build, input.browserProxy),
        actualPresentation: physical.presentation,
        physicalInput: physical.input,
        content: dimension(input.content.status, input.content.detail),
    } as const

    const reasons = Object.entries(dimensions)
        .filter(([, value]) => value.status !== 'pass')
        .map(([name, value]) => `${name}: ${value.detail}`)
    const values = Object.values(dimensions)
    const status: QualificationStatus = values.some(
        (value) => value.status === 'fail'
    )
        ? 'fail'
        : values.some((value) => value.status === 'block')
          ? 'block'
          : 'pass'

    return {
        status,
        nativeDeviceQualified: status === 'pass',
        dimensions,
        reasons,
    }
}

const DIMENSION_LABELS = {
    geometry: 'geometry',
    script: 'script',
    browserProxy: 'browser proxy',
    actualPresentation: 'actual presentation',
    physicalInput: 'physical input',
    content: 'content',
} as const

export function formatNativeGradeQualification(
    result: NativeGradeQualificationResult
): string {
    const lines = [`native-grade qualification: ${result.status.toUpperCase()}`]
    for (const [key, value] of Object.entries(result.dimensions) as Array<
        [
            keyof NativeGradeQualificationResult['dimensions'],
            QualificationDimension,
        ]
    >) {
        lines.push(
            `  ${DIMENSION_LABELS[key]}: ${value.status.toUpperCase()} — ${value.detail}`
        )
    }
    return lines.join('\n')
}
