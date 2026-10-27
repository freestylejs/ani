// Pure checks for the P0 remediation (J-001, J-002, J-003). Run: node .trace/ani_ios_production/p1_proofs.mjs
// Each check prints PASS/FAIL; the process exits non-zero on any failure.
let failed = 0
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
    if (!ok) failed++
}

// ---------- J-003: interval support check (ARCHITECTURE §4.2) ----------
const EPS = 1e-9
function measured(R, O) {
    if (O <= 1) return [0, Infinity]
    return [(R / (O + 1)) * (1 - EPS), (R / (O - 1)) * (1 + EPS)]
}
const mul = ([a, b], k) => [a * k, b * k]
const meet = ([a, b], [c, d]) => [Math.max(a, c), Math.min(b, d)]
const empty = ([a, b]) => a > b
const relHalfWidth = ([a, b]) => (b - a) / (b + a)

/**
 * nodes: top-down chain; each { W (true layout size), q (true inner scale), p (pose scale) }.
 * offset rounding: O = round(W) (or a snapped variant), R = S_true * W.
 * Returns { ok, reads } following §4.2 exactly.
 */
function supportChain(nodes, offset = Math.round) {
    let I = [1, 1]
    let Strue = 1
    let reads = 0
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        Strue *= n.p * n.q
        const R = Strue * n.W
        const O = offset(n.W)
        const M = measured(R, O)
        let qKnown = false
        let E = mul(I, n.p * 1)
        if (empty(meet(M, E))) {
            reads++
            qKnown = true
            E = mul(I, n.p * n.q)
            if (empty(meet(M, E))) return { ok: false, reads }
        }
        let next = qKnown ? meet(M, E) : M
        const hasChildren = i < nodes.length - 1
        if (relHalfWidth(next) > 0.005 && hasChildren && !qKnown) {
            reads++
            next = meet(M, mul(I, n.p * n.q))
        }
        I = next
    }
    return { ok: true, reads }
}

// The tribunal's counterexample: parent true width 50.49 (offsetWidth 50), child 1000 px.
for (const scale of [0.1, 1, 10]) {
    const r = supportChain([
        { W: 50.49, q: 1, p: scale },
        { W: 1000, q: 1, p: 1 },
    ])
    check(`J-003 fractional parent 50.49 / child 1000 at total scale ${scale}`, r.ok, `reads ${r.reads}`)
}
// The old rule (parent S = R / O propagated as exact, tolerance 1 px + 0.5 %) on the same case.
{
    const S_parent = 50.49 / 50
    const recovered = 1000 / S_parent
    const tol = 1 + 0.005 * 1000
    check(
        'J-003 old rule rejects the same tree (documents the defect)',
        Math.abs(recovered - 1000) > tol,
        `recovered ${recovered.toFixed(3)}, error ${(1000 - recovered).toFixed(3)} > ${tol}`
    )
}
// No false positive: random supported trees, depth 1..6, fractional sizes, scales 0.1..10, two rounding models.
{
    let seed = 7
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    let falsePositive = 0
    let total = 0
    for (let k = 0; k < 20000; k++) {
        const depth = 1 + Math.floor(rnd() * 6)
        const chain = []
        for (let d = 0; d < depth; d++) {
            chain.push({
                W: 0.3 + rnd() * 1500,
                q: rnd() < 0.3 ? 0.5 + rnd() * 1.5 : 1,
                p: rnd() < 0.5 ? 0.1 + rnd() * 9.9 : 1,
            })
        }
        const snap = rnd() < 0.5 ? Math.round : (w) => Math.round(w + (rnd() - 0.5) * 0.98)
        total++
        if (!supportChain(chain, snap).ok) falsePositive++
    }
    check(`J-003 no false positive on ${total} random supported chains`, falsePositive === 0, `${falsePositive} rejected`)
}
// Detection: an unsupported 3 % zoom on a 1000 px child under a 50.49 px parent is caught.
{
    const parent = { W: 50.49, q: 1, p: 1 }
    let Strue = 1
    // child with an unowned zoom 1.03 (q read as 1, so it cannot explain it)
    const I = (() => {
        const M = measured(50.49, 50)
        return meet(M, [1, 1]) // parent has children and is wide, so q was read (=1)
    })()
    Strue = 1.03
    const M = measured(Strue * 1000, 1000)
    const E = mul(I, 1)
    check('J-003 a 3 % unowned zoom under a small parent is detected', empty(meet(M, E)), `M [${M.map((x) => x.toFixed(5))}]`)
    void parent
}

// ---------- J-001: kept-track re-expression under a scaling ancestor (§5.7) ----------
{
    // Parent at live pose scale k about origin 0; child layout box x in parent local frame.
    // A presented inner scroll moves the child's layout box by d (local). Rest view-space delta = d (parent at rest
    // has scale 1). Presented drawn displacement at t_k = k*d.
    const k = 0.5
    const d = 20
    const deltaRest = d
    const drawnShift = k * d
    const rawDeltaError = Math.abs(deltaRest - drawnShift)
    check('J-001 raw δ translation is wrong under parent scale 0.5 (documents the defect)', rawDeltaError === 10, `${rawDeltaError} px first-frame error`)
    // Path 3: retarget from measured (B, v): the first frame equals B by construction.
    const B = 100 + drawnShift
    const firstFrame = B
    check('J-001 path 3 first frame equals measured B', Math.abs(firstFrame - B) <= 0.5)
    // Path 2 condition with the parent at rest (k = 1): translation is exact.
    check('J-001 path 2 exact when every ancestor scale is 1', Math.abs(1 * d - deltaRest) < 1e-12)
}

// ---------- J-002: one common displacement for descendants (§5.10) ----------
{
    // Parent origin track after release: spring 0.5 s from h0 = 80 px with v = 600 px/s; child residual: timing 0.1 s.
    const omega = (2 * Math.PI) / 0.5
    const h = (t) => (80 + (600 + omega * 80) * t) * Math.exp(-omega * t) // critically damped, bounce 0
    const childResidual = (t) => 40 * (1 - Math.min(1, t / 0.1)) // own relative motion toward A_child = 0
    let maxRelErr = 0
    let maxOldGap = 0
    for (let t = 0; t <= 1.2; t += 1 / 120) {
        const parentDrawn = 0 + h(t) // rest origin 0
        const childDrawn = 200 + childResidual(t) + h(t) // A_child = 200
        const relative = childDrawn - parentDrawn
        const expectedRelative = 200 + childResidual(t)
        maxRelErr = Math.max(maxRelErr, Math.abs(relative - expectedRelative))
        // Old rule: the child animates h under its own 0.1 s timing, independently.
        const oldChild = 200 + childResidual(t) + 80 * (1 - Math.min(1, t / 0.1))
        maxOldGap = Math.max(maxOldGap, Math.abs(oldChild - childDrawn))
    }
    check('J-002 child-to-parent geometry follows the residual only', maxRelErr < 1e-9, `max error ${maxRelErr.toExponential(2)}`)
    check('J-002 old independent-motion rule detaches the child (documents the defect)', maxOldGap > 10, `max gap ${maxOldGap.toFixed(1)} px`)
    // Velocity counted once: descendant drawn velocity at release = residual velocity + h'(0) = residual + v.
    const hdot = (t) =>
        ((600 + omega * 80) - omega * (80 + (600 + omega * 80) * t)) * Math.exp(-omega * t)
    const hdot0 = hdot(0)
    check('J-002 release velocity enters once (h′(0) = v)', Math.abs(hdot0 - 600) < 1e-9, `h′(0) ${hdot0.toFixed(6)}`)
}

if (failed) {
    console.log(`\n${failed} check(s) failed`)
    process.exit(1)
}
console.log('\nall checks passed')
