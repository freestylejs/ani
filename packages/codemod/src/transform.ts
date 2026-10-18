import { extname } from 'node:path'
import ts from 'typescript'
import {
    mentionsAni,
    ParseError,
    type RawWarning,
    transformScript,
    type WarningRule,
} from './script'

export interface Warning {
    rule: WarningRule
    message: string
    /** 1-based. */
    line: number
    /** 1-based. */
    column: number
}

export interface TransformResult {
    code: string
    warnings: Warning[]
}

const SCRIPT_KINDS = new Map<string, ts.ScriptKind>([
    ['.ts', ts.ScriptKind.TS],
    ['.mts', ts.ScriptKind.TS],
    ['.cts', ts.ScriptKind.TS],
    ['.tsx', ts.ScriptKind.TSX],
    ['.js', ts.ScriptKind.JS],
    ['.mjs', ts.ScriptKind.JS],
    ['.cjs', ts.ScriptKind.JS],
    ['.jsx', ts.ScriptKind.JSX],
])
const SFC_EXTENSIONS = ['.vue', '.svelte']

/** File extensions `transform` understands. */
export const SUPPORTED_EXTENSIONS = [...SCRIPT_KINDS.keys(), ...SFC_EXTENSIONS]

// Attribute values may contain `>` (e.g. `generic="T extends Array<string>"`).
const ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`
// A self-closing `<script />` has no content; the second branch is a block.
const SCRIPT_BLOCK = new RegExp(
    `<script\\b${ATTRS}/>|<script\\b(${ATTRS})>([\\s\\S]*?)</script>`,
    'gi'
)
const TS_LANG = /\blang\s*=\s*["']?(?:ts|typescript)\b/i

function position(
    source: string,
    pos: number
): { line: number; column: number } {
    let line = 1
    let lineStart = -1
    for (let i = 0; i < pos; i++) {
        if (source.charCodeAt(i) === 10) {
            line++
            lineStart = i
        }
    }
    return { line, column: pos - lineStart }
}

function locate(
    fileName: string,
    source: string,
    pos: number,
    reason: string
): Error {
    const { line, column } = position(source, pos)
    return new Error(`${fileName}:${line}:${column} ${reason}`)
}

/** Transforms the content of every `<script>` block, keeping the rest. */
function transformBlocks(
    source: string,
    fileName: string
): { code: string; warnings: RawWarning[] } {
    let code = ''
    let cursor = 0
    const warnings: RawWarning[] = []
    for (const match of source.matchAll(SCRIPT_BLOCK)) {
        const [whole, attrs = '', content = ''] = match
        if (!mentionsAni(content)) continue
        const start =
            match.index + whole.length - '</script>'.length - content.length
        const kind = TS_LANG.test(attrs) ? ts.ScriptKind.TS : ts.ScriptKind.JS
        try {
            const result = transformScript(content, `${fileName}.ts`, kind)
            code += source.slice(cursor, start) + result.code
            cursor = start + content.length
            for (const w of result.warnings)
                warnings.push({ ...w, pos: w.pos + start })
        } catch (error) {
            if (!(error instanceof ParseError)) throw error
            throw locate(fileName, source, start + error.pos, error.message)
        }
    }
    return { code: code + source.slice(cursor), warnings }
}

function transformFile(
    source: string,
    fileName: string
): { code: string; warnings: RawWarning[] } {
    const extension = extname(fileName).toLowerCase()
    if (SFC_EXTENSIONS.includes(extension))
        return transformBlocks(source, fileName)
    const kind = SCRIPT_KINDS.get(extension) ?? ts.ScriptKind.TS
    try {
        return transformScript(source, fileName, kind)
    } catch (error) {
        if (!(error instanceof ParseError)) throw error
        throw locate(fileName, source, error.pos, error.message)
    }
}

/**
 * Rewrites ANI 1.x call sites in `source` to ANI 2. Files that do not import
 * ANI are returned unchanged; whatever cannot be rewritten safely is reported
 * as a warning. Throws when a file that imports ANI has a syntax error.
 */
export function transform(source: string, fileName: string): TransformResult {
    if (!mentionsAni(source)) return { code: source, warnings: [] }
    const { code, warnings } = transformFile(source, fileName)
    return {
        code,
        warnings: warnings.map(({ pos, rule, message }) => ({
            rule,
            message,
            ...position(source, pos),
        })),
    }
}
