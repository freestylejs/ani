import ts from 'typescript'
import { EditSet } from './edits'

export type WarningRule =
    | 'ambiguous-play'
    | 'reset-arguments'
    | 'property-resolver'
    | 'context-removed'
    | 'clock-reset'
    | 'clock-create'
    | 'react-use-ani-ref'

export interface RawWarning {
    rule: WarningRule
    message: string
    /** Offset into the original source. */
    pos: number
}

export class ParseError extends Error {
    constructor(
        message: string,
        readonly pos: number
    ) {
        super(message)
        this.name = 'ParseError'
    }
}

const CORE = '@freestylejs/ani-core'
const REACT = '@freestylejs/ani-react'
const ANI_MODULES = [
    CORE,
    REACT,
    '@freestylejs/ani-vue',
    '@freestylejs/ani-solid',
    '@freestylejs/ani-svelte',
]

const TIMELINE_RENAMES = new Map([
    ['dynamicTimeline', 'rafTimeline'],
    ['timeline', 'waapiTimeline'],
    ['webTimeline', 'waapiTimeline'],
])

const GETTER_CALLS = new Map([
    ['getCurrentValue', 'value'],
    ['getCurrentVelocity', 'velocity'],
])

function isAniModule(specifier: string): boolean {
    return ANI_MODULES.some(
        (m) => specifier === m || specifier.startsWith(`${m}/`)
    )
}

interface Context {
    sf: ts.SourceFile
    edits: EditSet
    warnings: RawWarning[]
    /** Local names bound to the ANI `a` object or namespace. */
    aliases: Set<string>
    /** Local name -> imported name, for named imports from ani-core. */
    named: Map<string, string>
    clockLocals: Set<string>
    useAniRef: Set<string>
    /** Unaliased imports of a deprecated timeline name (renamed everywhere). */
    renamedLocals: Set<string>
    clockRefs: ts.Identifier[]
    clockHandled: Set<ts.Node>
    clockUsed: boolean
}

const isUndefined = (node: ts.Node): boolean =>
    ts.isIdentifier(node) && node.text === 'undefined'

const isNumberLiteral = (node: ts.Node): boolean =>
    ts.isNumericLiteral(node) ||
    (ts.isPrefixUnaryExpression(node) &&
        (node.operator === ts.SyntaxKind.MinusToken ||
            node.operator === ts.SyntaxKind.PlusToken) &&
        ts.isNumericLiteral(node.operand))

const isBoolean = (node: ts.Node): boolean =>
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword

function render(ctx: Context, node: ts.Node): string {
    return ctx.edits.render(node.getStart(ctx.sf), node.end)
}

function warn(
    ctx: Context,
    rule: WarningRule,
    message: string,
    node: ts.Node
): void {
    ctx.warnings.push({ rule, message, pos: node.getStart(ctx.sf) })
}

function propName(prop: ts.ObjectLiteralElementLike): string | undefined {
    if (
        !ts.isPropertyAssignment(prop) &&
        !ts.isShorthandPropertyAssignment(prop)
    )
        return undefined
    const name = prop.name
    return ts.isIdentifier(name) || ts.isStringLiteral(name)
        ? name.text
        : undefined
}

function findProp(
    obj: ts.ObjectLiteralExpression,
    name: string
): ts.ObjectLiteralElementLike | undefined {
    return obj.properties.find((p) => propName(p) === name)
}

function renameKey(
    ctx: Context,
    prop: ts.ObjectLiteralElementLike,
    newName: string
): void {
    if (ts.isPropertyAssignment(prop)) {
        ctx.edits.replace(prop.name.getStart(ctx.sf), prop.name.end, newName)
    } else if (ts.isShorthandPropertyAssignment(prop)) {
        ctx.edits.replace(
            prop.name.getStart(ctx.sf),
            prop.name.end,
            `${newName}: ${prop.name.text}`
        )
    }
}

function addToObject(
    ctx: Context,
    obj: ts.ObjectLiteralExpression,
    entry: string
): void {
    const last = obj.properties[obj.properties.length - 1]
    if (last) ctx.edits.insert(last.end, `, ${entry}`)
    else ctx.edits.replace(obj.getStart(ctx.sf), obj.end, `{ ${entry} }`)
}

/** `f(a, b, c)` -> `f(a, { k1: b, k2: c })` for the arguments after `keep`. */
function toOptions(
    ctx: Context,
    call: ts.CallExpression,
    keep: number,
    keys: string[]
): void {
    const args = call.arguments
    const first = args[keep]
    const last = args[args.length - 1]
    const before = args[keep - 1]
    if (!first || !last || !before) return
    if (args.length > keep + keys.length || args.some(ts.isSpreadElement))
        return
    if (args.length === keep + 1 && ts.isObjectLiteralExpression(first)) return
    const rest = args.slice(keep)
    const kept = rest.filter((arg) => !isUndefined(arg))
    const lastKept = kept[kept.length - 1]
    if (!lastKept) {
        ctx.edits.replace(before.end, last.end, '')
        return
    }
    // Removals first: an insert at a removed range's edge would be swallowed.
    rest.forEach((arg, i) => {
        if (!isUndefined(arg)) return
        const next = rest.slice(i + 1).find((a) => !isUndefined(a))
        if (next)
            ctx.edits.replace(arg.getStart(ctx.sf), next.getStart(ctx.sf), '')
        else ctx.edits.replace(lastKept.end, arg.end, '')
    })
    // Inserts only, so separators and comments between arguments stay.
    rest.forEach((arg, i) => {
        if (isUndefined(arg)) return
        const open = arg === kept[0] ? '{ ' : ''
        ctx.edits.insert(arg.getStart(ctx.sf), `${open}${keys[i]}: `)
    })
    ctx.edits.insert(lastKept.end, ' }')
}

function rewriteAni(ctx: Context, call: ts.CallExpression): void {
    const [props, id] = call.arguments
    if (call.arguments.length !== 2 || !props || !id) return
    if (ts.isSpreadElement(props) || ts.isSpreadElement(id)) return
    if (isUndefined(id)) {
        ctx.edits.replace(props.end, id.end, '')
        return
    }
    const entry = `id: ${render(ctx, id)}`
    if (ts.isObjectLiteralExpression(props)) {
        addToObject(ctx, props, entry)
        ctx.edits.replace(props.end, id.end, '')
    } else {
        const spread = `{ ...${render(ctx, props)}, ${entry} }`
        ctx.edits.replace(props.getStart(ctx.sf), id.end, spread)
    }
}

function rewriteRafTimeline(ctx: Context, call: ts.CallExpression): void {
    const [, clock] = call.arguments
    if (call.arguments.length !== 2 || !clock) return
    if (ts.isObjectLiteralExpression(clock) || isUndefined(clock)) return
    if (ts.isSpreadElement(clock)) return
    ctx.edits.replace(
        clock.getStart(ctx.sf),
        clock.end,
        `{ clock: ${render(ctx, clock)} }`
    )
}

function rewriteCreateStates(ctx: Context, call: ts.CallExpression): void {
    const [config] = call.arguments
    if (!config || !ts.isObjectLiteralExpression(config)) return
    const prop = findProp(config, 'initialFrom')
    if (prop) renameKey(ctx, prop, 'initialValue')
}

function delayText(ctx: Context, init: ts.Expression): string {
    if (ts.isNumericLiteral(init)) return String(Number(init.text) / 1000)
    if (
        ts.isPrefixUnaryExpression(init) &&
        init.operator === ts.SyntaxKind.MinusToken &&
        ts.isNumericLiteral(init.operand)
    ) {
        return `-${Number(init.operand.text) / 1000}`
    }
    const text = render(ctx, init)
    const simple =
        ts.isIdentifier(init) ||
        ts.isPropertyAccessExpression(init) ||
        ts.isParenthesizedExpression(init)
    return simple ? `${text} / 1000` : `(${text}) / 1000`
}

function convertDelay(ctx: Context, prop: ts.ObjectLiteralElementLike): void {
    if (ts.isShorthandPropertyAssignment(prop)) {
        ctx.edits.replace(
            prop.name.getStart(ctx.sf),
            prop.name.end,
            'delay: delay / 1000'
        )
    } else if (
        ts.isPropertyAssignment(prop) &&
        !isUndefined(prop.initializer)
    ) {
        const init = prop.initializer
        ctx.edits.replace(init.getStart(ctx.sf), init.end, delayText(ctx, init))
    }
}

/** Handles the options of a `play` / `transitionTo` config object literal. */
function processConfig(
    ctx: Context,
    call: ts.CallExpression,
    config: ts.Node | undefined,
    engine: 'raf' | 'waapi'
): void {
    if (!config || !ts.isObjectLiteralExpression(config)) return
    for (const prop of config.properties) {
        const name = propName(prop)
        if (name === 'delay') {
            convertDelay(ctx, prop)
        } else if (engine === 'waapi' && name === 'propertyResolver') {
            renameKey(ctx, prop, 'resolver')
        } else if (engine === 'waapi' && name === 'keyframeEffect') {
            renameKey(ctx, prop, 'effect')
        } else if (engine === 'raf' && name === 'propertyResolver') {
            warn(
                ctx,
                'property-resolver',
                'Remove `propertyResolver` from this config and register the resolver where the timeline is created.',
                call
            )
        } else if (engine === 'raf' && name === 'context') {
            warn(
                ctx,
                'context-removed',
                'Remove `context` from this config and pass the values through the timeline or its nodes instead.',
                call
            )
        }
    }
}

/** `(config, flag)` -> `({ ...config, interrupt: flag })`. */
function rewriteInterrupt(
    ctx: Context,
    configIndex: number,
    flagIndex: number,
    call: ts.CallExpression
): void {
    const config = call.arguments[configIndex]
    const flag = call.arguments[flagIndex]
    if (!config || !flag) return
    const entry = `interrupt: ${flag.getText(ctx.sf)}`
    if (ts.isObjectLiteralExpression(config)) {
        addToObject(ctx, config, entry)
        ctx.edits.replace(config.end, flag.end, '')
    } else if (isUndefined(config)) {
        ctx.edits.replace(config.getStart(ctx.sf), flag.end, `{ ${entry} }`)
    } else {
        const text = `{ ...${render(ctx, config)}, ${entry} }`
        ctx.edits.replace(config.getStart(ctx.sf), flag.end, text)
    }
}

function handlePlay(ctx: Context, call: ts.CallExpression): void {
    const [first, second] = call.arguments
    if (!first) return
    if (call.arguments.length === 1) {
        processConfig(ctx, call, first, 'raf')
    } else if (second && ts.isObjectLiteralExpression(second)) {
        processConfig(ctx, call, second, 'waapi')
    } else if (call.arguments.length === 2 && second && isBoolean(second)) {
        processConfig(ctx, call, first, 'raf')
        rewriteInterrupt(ctx, 0, 1, call)
    } else {
        warn(
            ctx,
            'ambiguous-play',
            'Cannot tell whether this `play` call uses the RAF or the WAAPI signature; replace the second argument with `{ interrupt }` (RAF) or pass a config object (WAAPI) by hand.',
            call
        )
    }
}

function handleTransitionTo(ctx: Context, call: ts.CallExpression): void {
    const args = call.arguments
    const flag = args[2]
    if (args.length <= 2) {
        processConfig(ctx, call, args[1], 'raf')
    } else if (args.length === 3 && flag && isBoolean(flag)) {
        processConfig(ctx, call, args[1], 'raf')
        rewriteInterrupt(ctx, 1, 2, call)
    } else {
        warn(
            ctx,
            'ambiguous-play',
            'Cannot tell what the third argument of `transitionTo` is; move the interrupt flag into the config object as `{ interrupt }` by hand.',
            call
        )
    }
}

function handleOnTimelineChange(
    ctx: Context,
    call: ts.CallExpression,
    callee: ts.PropertyAccessExpression
): void {
    ctx.edits.replace(
        callee.name.getStart(ctx.sf),
        callee.name.end,
        'onTransition'
    )
    const [cb] = call.arguments
    if (call.arguments.length !== 1 || !cb) return
    if (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) {
        const [first] = cb.parameters
        const parenthesized = cb
            .getChildren(ctx.sf)
            .some((c) => c.kind === ts.SyntaxKind.OpenParenToken)
        if (first && parenthesized) {
            ctx.edits.insert(first.getStart(ctx.sf), '_state, ')
        } else if (first) {
            ctx.edits.replace(
                first.getStart(ctx.sf),
                first.end,
                `(_state, ${render(ctx, first)})`
            )
        } else {
            ctx.edits.insert(cb.parameters.pos, '_state')
        }
    } else {
        ctx.edits.replace(
            cb.getStart(ctx.sf),
            cb.end,
            `(_state, timeline) => (${render(ctx, cb)})(timeline)`
        )
    }
}

function handleMember(
    ctx: Context,
    call: ts.CallExpression,
    callee: ts.PropertyAccessExpression
): void {
    const name = callee.name.text
    const getter = GETTER_CALLS.get(name)
    if (getter) {
        if (call.arguments.length === 0)
            ctx.edits.replace(callee.name.getStart(ctx.sf), call.end, getter)
    } else if (name === 'play') {
        handlePlay(ctx, call)
    } else if (name === 'transitionTo') {
        handleTransitionTo(ctx, call)
    } else if (name === 'onTimelineChange') {
        handleOnTimelineChange(ctx, call, callee)
    } else if (name === 'reset' && call.arguments.length > 0) {
        ctx.edits.replace(call.arguments.pos, call.arguments.end, '')
        warn(
            ctx,
            'reset-arguments',
            '`reset` takes no arguments in ANI 2; its arguments were removed, check that the old behavior is not needed.',
            call
        )
    }
}

function handleClock(
    ctx: Context,
    call: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    target: ts.Identifier
): void {
    const name = callee.name.text
    if (name === 'configure') {
        ctx.edits.replace(target.getStart(ctx.sf), target.end, 'defaultClock')
        ctx.clockHandled.add(target)
        ctx.clockUsed = true
        const [arg] = call.arguments
        if (call.arguments.length === 1 && arg && isNumberLiteral(arg)) {
            ctx.edits.replace(
                arg.getStart(ctx.sf),
                arg.end,
                `{ maxDeltaTime: ${render(ctx, arg)} }`
            )
        }
    } else if (name === 'create' && call.arguments.length === 0) {
        ctx.edits.replace(call.getStart(ctx.sf), call.end, 'defaultClock')
        ctx.clockHandled.add(target)
        ctx.clockUsed = true
    } else if (name === 'create') {
        warn(
            ctx,
            'clock-create',
            'ANI 2 has no `AnimationClock.create(maxDeltaTime)`; use `defaultClock.configure({ maxDeltaTime })` or create a clock with `createClock` by hand.',
            call
        )
    } else if (name === 'reset') {
        warn(
            ctx,
            'clock-reset',
            'ANI 2 has no `AnimationClock.reset()`; dispose the clocks and timelines you created instead.',
            call
        )
    }
}

function resolveAni(ctx: Context, callee: ts.Expression): string | undefined {
    if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        ctx.aliases.has(callee.expression.text)
    ) {
        const name = callee.name.text
        return TIMELINE_RENAMES.get(name) ?? name
    }
    if (!ts.isIdentifier(callee)) return undefined
    const imported = ctx.named.get(callee.text)
    if (imported === undefined) return undefined
    return TIMELINE_RENAMES.get(imported) ?? imported
}

function handleBuilder(ctx: Context, name: string, call: ts.CallExpression) {
    switch (name) {
        case 'sequence':
        case 'parallel':
            return toOptions(ctx, call, 1, ['timing', 'id'])
        case 'loop':
            return toOptions(ctx, call, 2, ['timing', 'id'])
        case 'delay':
            return toOptions(ctx, call, 1, ['id'])
        case 'stagger':
            return toOptions(ctx, call, 1, ['offset', 'timing', 'id'])
        case 'ani':
            return rewriteAni(ctx, call)
        case 'rafTimeline':
            return rewriteRafTimeline(ctx, call)
        case 'createStates':
            return rewriteCreateStates(ctx, call)
        default:
            return
    }
}

function handleCall(ctx: Context, call: ts.CallExpression): void {
    const callee = call.expression
    if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        ctx.clockLocals.has(callee.expression.text)
    ) {
        return handleClock(ctx, call, callee, callee.expression)
    }
    const builder = resolveAni(ctx, callee)
    if (builder !== undefined) return handleBuilder(ctx, builder, call)
    if (
        ts.isIdentifier(callee) &&
        ctx.useAniRef.has(callee.text) &&
        call.arguments.length === 2
    ) {
        return warn(
            ctx,
            'react-use-ani-ref',
            'The `useAniRef(ref, props)` signature changed in ANI 2; update this call by hand.',
            call
        )
    }
    if (ts.isPropertyAccessExpression(callee)) handleMember(ctx, call, callee)
}

function handleAccess(ctx: Context, node: ts.PropertyAccessExpression): void {
    const name = node.name
    const target = node.expression
    const renamed = TIMELINE_RENAMES.get(name.text)
    let text: string | undefined
    if (renamed && ts.isIdentifier(target) && ctx.aliases.has(target.text)) {
        text = renamed
    } else if (name.text === 'currentConfig') {
        text = 'config'
    } else if (name.text === 'nativeAnimation') {
        text = 'animations[0]'
    }
    if (text) ctx.edits.replace(name.getStart(ctx.sf), name.end, text)
}

function handleQualifiedName(ctx: Context, node: ts.QualifiedName): void {
    const renamed = TIMELINE_RENAMES.get(node.right.text)
    if (
        renamed &&
        ts.isIdentifier(node.left) &&
        ctx.aliases.has(node.left.text)
    )
        ctx.edits.replace(node.right.getStart(ctx.sf), node.right.end, renamed)
}

/** True when the identifier uses a binding (not a property key or a declaration). */
function isReference(id: ts.Identifier): boolean {
    const parent = id.parent
    if (ts.isPropertyAccessExpression(parent)) return parent.name !== id
    if (ts.isQualifiedName(parent)) return parent.right !== id
    if (ts.isBindingElement(parent) && parent.propertyName === id) return false
    if (ts.isShorthandPropertyAssignment(parent)) return true
    return (parent as { name?: ts.Node }).name !== id
}

function bindingNames(name: ts.BindingName, out: Set<string>): void {
    if (ts.isIdentifier(name)) {
        out.add(name.text)
        return
    }
    for (const element of name.elements) {
        if (ts.isBindingElement(element)) bindingNames(element.name, out)
    }
}

/** Names declared directly by a function, block, loop head or catch clause. */
function declaredNames(scope: ts.Node): Set<string> {
    const names = new Set<string>()
    const declarations = (list: ts.VariableDeclarationList) => {
        for (const d of list.declarations) bindingNames(d.name, names)
    }
    if (ts.isFunctionLike(scope)) {
        for (const p of scope.parameters) bindingNames(p.name, names)
    } else if (ts.isBlock(scope)) {
        for (const s of scope.statements) {
            if (ts.isVariableStatement(s)) declarations(s.declarationList)
            else if (
                (ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) &&
                s.name
            )
                names.add(s.name.text)
        }
    } else if (ts.isForStatement(scope) || ts.isForInStatement(scope)) {
        const init = scope.initializer
        if (init && ts.isVariableDeclarationList(init)) declarations(init)
    } else if (ts.isForOfStatement(scope)) {
        if (ts.isVariableDeclarationList(scope.initializer))
            declarations(scope.initializer)
    } else if (ts.isCatchClause(scope) && scope.variableDeclaration) {
        bindingNames(scope.variableDeclaration.name, names)
    }
    return names
}

function isShadowed(id: ts.Identifier): boolean {
    for (let scope = id.parent; scope; scope = scope.parent) {
        if (declaredNames(scope).has(id.text)) return true
    }
    return false
}

/** Renames a reference to an unaliased import whose name changed in ANI 2. */
function renameReference(ctx: Context, id: ts.Identifier): void {
    const renamed = TIMELINE_RENAMES.get(id.text)
    const parent = id.parent
    if (!renamed || isShadowed(id)) return
    let text = renamed
    if (ts.isExportSpecifier(parent)) {
        const reexport = parent.parent.parent.moduleSpecifier
        if (reexport || (parent.propertyName && parent.propertyName !== id))
            return
        if (!parent.propertyName) text = `${renamed} as ${id.text}`
    } else if (!isReference(id)) {
        return
    } else if (ts.isShorthandPropertyAssignment(parent)) {
        text = `${id.text}: ${renamed}`
    }
    ctx.edits.replace(id.getStart(ctx.sf), id.end, text)
}

function visit(ctx: Context, node: ts.Node): void {
    if (ts.isImportDeclaration(node)) return
    if (ts.isIdentifier(node)) {
        if (ctx.clockLocals.has(node.text) && isReference(node))
            ctx.clockRefs.push(node)
        if (ctx.renamedLocals.has(node.text)) renameReference(ctx, node)
    }
    ts.forEachChild(node, (child) => visit(ctx, child))
    if (ts.isPropertyAccessExpression(node)) handleAccess(ctx, node)
    else if (ts.isQualifiedName(node)) handleQualifiedName(ctx, node)
    else if (ts.isCallExpression(node)) handleCall(ctx, node)
}

function aniImports(sf: ts.SourceFile) {
    const out: { decl: ts.ImportDeclaration; module: string }[] = []
    for (const decl of sf.statements) {
        if (!ts.isImportDeclaration(decl)) continue
        if (!ts.isStringLiteral(decl.moduleSpecifier)) continue
        const module = decl.moduleSpecifier.text
        if (isAniModule(module)) out.push({ decl, module })
    }
    return out
}

function collectBindings(
    ctx: Context,
    imports: ReturnType<typeof aniImports>
): void {
    for (const { decl, module } of imports) {
        const bindings = decl.importClause?.namedBindings
        if (!bindings) continue
        if (ts.isNamespaceImport(bindings)) {
            ctx.aliases.add(bindings.name.text)
            continue
        }
        for (const spec of bindings.elements) {
            const imported = (spec.propertyName ?? spec.name).text
            const local = spec.name.text
            if (imported === 'a') ctx.aliases.add(local)
            if (module === REACT && imported === 'useAniRef')
                ctx.useAniRef.add(local)
            if (module !== CORE) continue
            ctx.named.set(local, imported)
            if (local === imported && TIMELINE_RENAMES.has(imported))
                ctx.renamedLocals.add(local)
            if (imported === 'AnimationClock') ctx.clockLocals.add(local)
        }
    }
}

function specifierText(
    ctx: Context,
    spec: ts.ImportSpecifier,
    renamed?: string
): string {
    const imported = spec.propertyName ?? spec.name
    const importedText = renamed ?? imported.getText(ctx.sf)
    const alias = spec.propertyName ? ` as ${spec.name.text}` : ''
    return `${spec.isTypeOnly ? 'type ' : ''}${importedText}${alias}`
}

function rewriteImport(
    ctx: Context,
    decl: ts.ImportDeclaration,
    clause: ts.ImportClause,
    bindings: ts.NamedImports,
    isCore: boolean,
    clockKept: boolean
): void {
    const namespaces: string[] = []
    const items: string[] = []
    const renames: [ts.Node, string][] = []
    let rebuild = false
    for (const spec of bindings.elements) {
        const imported = spec.propertyName ?? spec.name
        if (imported.text === 'a') {
            namespaces.push(spec.name.text)
            rebuild = true
        } else if (isCore && imported.text === 'AnimationClock') {
            if (clockKept) items.push(specifierText(ctx, spec))
            else rebuild = true
            const hasDefault = ctx.named.has('defaultClock')
            if (ctx.clockUsed && !hasDefault) {
                items.push('defaultClock')
                rebuild = true
            }
        } else {
            const renamed = isCore
                ? TIMELINE_RENAMES.get(imported.text)
                : undefined
            if (renamed) renames.push([imported, renamed])
            items.push(specifierText(ctx, spec, renamed))
        }
    }
    if (!rebuild) {
        for (const [node, text] of renames)
            ctx.edits.replace(node.getStart(ctx.sf), node.end, text)
        return
    }
    const text = ctx.sf.text
    const semi = decl.getText(ctx.sf).endsWith(';') ? ';' : ''
    const module = decl.moduleSpecifier.getText(ctx.sf)
    const type = clause.isTypeOnly ? 'type ' : ''
    const lines = namespaces.map(
        (n) => `import ${type}* as ${n} from ${module}${semi}`
    )
    const rest = [
        clause.name?.text,
        items.length > 0 ? `{ ${items.join(', ')} }` : undefined,
    ].filter(Boolean)
    if (rest.length > 0)
        lines.push(`import ${type}${rest.join(', ')} from ${module}${semi}`)
    const eol = text.includes('\r\n') ? '\r\n' : '\n'
    const start = decl.getStart(ctx.sf)
    if (lines.length > 0) {
        ctx.edits.replace(start, decl.end, lines.join(eol))
    } else {
        const trailing = text.startsWith(eol, decl.end) ? eol.length : 0
        ctx.edits.replace(start, decl.end + trailing, '')
    }
}

function rewriteImports(
    ctx: Context,
    imports: ReturnType<typeof aniImports>
): void {
    const clockKept = ctx.clockRefs.some((r) => !ctx.clockHandled.has(r))
    for (const { decl, module } of imports) {
        const clause = decl.importClause
        const bindings = clause?.namedBindings
        if (clause && bindings && ts.isNamedImports(bindings)) {
            rewriteImport(
                ctx,
                decl,
                clause,
                bindings,
                module === CORE,
                clockKept
            )
        }
    }
}

/** True when the text may contain an ANI import (cheap pre-check). */
export function mentionsAni(source: string): boolean {
    return source.includes('@freestylejs/ani-')
}

/** Transforms one script (a whole `.ts` / `.js` file or a script block). */
export function transformScript(
    source: string,
    fileName: string,
    kind: ts.ScriptKind
): { code: string; warnings: RawWarning[] } {
    const sf = ts.createSourceFile(
        fileName,
        source,
        ts.ScriptTarget.Latest,
        true,
        kind
    )
    const imports = aniImports(sf)
    if (imports.length === 0) return { code: source, warnings: [] }

    const syntax = (
        sf as unknown as {
            parseDiagnostics: readonly ts.DiagnosticWithLocation[]
        }
    ).parseDiagnostics[0]
    if (syntax) {
        const reason = ts.flattenDiagnosticMessageText(syntax.messageText, '\n')
        throw new ParseError(reason, syntax.start)
    }

    const ctx: Context = {
        sf,
        edits: new EditSet(source),
        warnings: [],
        aliases: new Set(),
        named: new Map(),
        clockLocals: new Set(),
        useAniRef: new Set(),
        renamedLocals: new Set(),
        clockRefs: [],
        clockHandled: new Set(),
        clockUsed: false,
    }
    collectBindings(ctx, imports)
    visit(ctx, sf)
    rewriteImports(ctx, imports)
    ctx.warnings.sort((a, b) => a.pos - b.pos)
    return { code: ctx.edits.result(), warnings: ctx.warnings }
}
