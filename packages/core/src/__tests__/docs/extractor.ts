import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'

export interface ExtractedFence {
    /** File path relative to repo root */
    filePath: string
    /** 1-based line number of fence opening in markdown */
    fenceLine: number
    /** 1-based line number where code actually begins */
    codeLine: number
    /** Full fence info string */
    info: string
    /** Language for typechecking: 'ts' | 'tsx' | 'js' */
    lang: 'ts' | 'tsx' | 'js'
    /** Original language specified on fence (e.g. 'vue', 'svelte', 'typescript') */
    sourceLang: string
    /** Raw code content */
    rawCode: string
    /** Virtual code content (padded with newlines to align line numbers) */
    virtualCode: string
    /** Virtual file path */
    virtualPath: string
    /** Optional title from fence meta */
    title?: string | undefined
    /** True if fence is expected to throw AniError when run */
    throws: boolean
    /** Opt-out reason if nocheck is specified */
    nocheck?: string | undefined
    /** True if runnable as core example */
    isCoreOnly: boolean
}

const FENCE_BLOCK =
    /^([ \t]*)(`{3,}|~{3,})([^\r\n]*)\r?\n((?:[\s\S]*?\r?\n)??)[ \t]*(?:\2`*|\2~*)[ \t]*(?=\r?\n|$)/gm
const SCRIPT_BLOCK = /<script\b([^>]*)>([\s\S]*?)<\/script>/i
const TS_LANG = /\blang\s*=\s*["']?(?:ts|typescript)\b/i
const CORE_SPECIFIERS = new Set([
    '@freestylejs/ani-core',
    '@freestylejs/ani-core/testing',
    '@freestylejs/ani-core/values',
])

function collectDocsFiles(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            files.push(...collectDocsFiles(full))
        } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
            files.push(full)
        }
    }
    return files
}

function checkImportsAndJsx(
    code: string,
    isTsx: boolean
): { isCoreOnly: boolean } {
    const sf = ts.createSourceFile(
        'temp.' + (isTsx ? 'tsx' : 'ts'),
        code,
        ts.ScriptTarget.ESNext,
        true
    )
    const imports: string[] = []
    let hasJsx = false

    function walk(node: ts.Node): void {
        if (ts.isImportDeclaration(node)) {
            if (ts.isStringLiteral(node.moduleSpecifier)) {
                imports.push(node.moduleSpecifier.text)
            }
        } else if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword
        ) {
            const arg = node.arguments[0]
            if (arg && ts.isStringLiteral(arg)) {
                imports.push(arg.text)
            }
        } else if (
            ts.isJsxElement(node) ||
            ts.isJsxSelfClosingElement(node) ||
            ts.isJsxFragment(node)
        ) {
            hasJsx = true
        }
        ts.forEachChild(node, walk)
    }

    walk(sf)
    const isCoreOnly =
        !hasJsx &&
        imports.length > 0 &&
        imports.every((imp) => CORE_SPECIFIERS.has(imp))
    return { isCoreOnly }
}

/**
 * Extracts and classifies all code fences from docs markdown files.
 */
export function extractDocsFences(repoRoot: string): ExtractedFence[] {
    const docsDir = join(repoRoot, 'packages/web/content/docs')
    const files = collectDocsFiles(docsDir).sort()
    const fences: ExtractedFence[] = []
    let counter = 0

    for (const filePath of files) {
        const relPath = relative(repoRoot, filePath)
        const rawContent = readFileSync(filePath, 'utf8')
        const content = rawContent.replace(/\r\n/g, '\n')
        let line = 1
        let lastIdx = 0

        for (const match of content.matchAll(FENCE_BLOCK)) {
            const pre = content.slice(lastIdx, match.index)
            line += (pre.match(/\n/g) || []).length
            lastIdx = match.index

            const [, , , infoRaw = '', rawCode = ''] = match
            const info = infoRaw.trim()
            const parts = info.split(/\s+/)
            const rawLang = (parts[0] || '').toLowerCase()

            const nocheckMatch = info.match(
                /\bnocheck(?:=(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/
            )
            const nocheck = nocheckMatch
                ? (nocheckMatch[1] ??
                  nocheckMatch[2] ??
                  nocheckMatch[3] ??
                  'unspecified')
                : undefined

            const throws = /\bthrows\b/.test(info)
            const titleMatch = info.match(
                /\btitle=(?:"([^"]*)"|'([^']*)'|([^\s]+))/
            )
            const title = titleMatch?.[1] ?? titleMatch?.[2] ?? titleMatch?.[3]

            let lang: 'ts' | 'tsx' | 'js' | undefined
            let code = rawCode
            let codeLine = line + 1

            if (rawLang === 'ts' || rawLang === 'typescript') {
                lang = 'ts'
            } else if (rawLang === 'tsx') {
                lang = 'tsx'
            } else if (rawLang === 'vue' || rawLang === 'svelte') {
                const scriptMatch = rawCode.match(SCRIPT_BLOCK)
                if (scriptMatch) {
                    const attrs = scriptMatch[1] || ''
                    code = scriptMatch[2] || ''
                    const isTs = TS_LANG.test(attrs)
                    lang = isTs ? 'ts' : 'js'
                    const beforeScript = rawCode.slice(
                        0,
                        (scriptMatch.index ?? 0) +
                            (scriptMatch[0]?.indexOf(code) ?? 0)
                    )
                    codeLine =
                        line + 1 + (beforeScript.match(/\n/g) || []).length
                }
            }

            if (!lang) continue

            counter++
            const ext = lang === 'tsx' ? '.tsx' : lang === 'js' ? '.js' : '.ts'
            const virtualPath = resolve(
                repoRoot,
                `packages/web/content/docs/__virtual_fence_${counter}${ext}`
            )

            // Pad with newlines so virtual file lines match source markdown lines
            const padLines = Math.max(0, codeLine - 1)
            let virtualCode = '\n'.repeat(padLines) + code

            // Solid JSX pragma when compiling in a React JSX program
            const isSolid =
                relPath.includes('/solid/') ||
                code.includes('@freestylejs/ani-solid')
            if (lang === 'tsx' && isSolid) {
                virtualCode =
                    padLines >= 1
                        ? '/* @jsxImportSource solid-js */\n' +
                          '\n'.repeat(padLines - 1) +
                          code
                        : '/* @jsxImportSource solid-js */ ' + code
            }

            const { isCoreOnly } =
                lang === 'ts' && !nocheck
                    ? checkImportsAndJsx(code, false)
                    : { isCoreOnly: false }

            fences.push({
                filePath: relPath,
                fenceLine: line,
                codeLine,
                info,
                lang,
                sourceLang: rawLang,
                rawCode: code,
                virtualCode,
                virtualPath,
                title,
                throws,
                nocheck,
                isCoreOnly,
            })
        }
    }

    return fences
}
