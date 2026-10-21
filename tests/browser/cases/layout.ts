import {
    createLayoutGroup,
    shareElement,
    supportsViewTransition,
    viewTransition,
} from '@freestylejs/ani-layout'
import { expectClose, expectEqual } from './assert'

export const pageOptions = {
    L4: { reducedMotion: 'reduce' },
} as const

export const knownFailures: Record<string, string> = {}

function stage(): HTMLElement {
    const element = document.createElement('div')
    element.style.cssText =
        'position: relative; width: 320px; height: 220px; contain: layout;'
    document.body.append(element)
    return element
}

function box(parent: HTMLElement, css: string): HTMLElement {
    const element = document.createElement('div')
    element.style.cssText = `position: absolute; background: #222; ${css}`
    parent.append(element)
    return element
}

export async function L1(): Promise<string> {
    const root = stage()
    const element = box(root, 'left: 0; top: 0; width: 50px; height: 40px;')
    const group = createLayoutGroup({ motion: { duration: 0.12 } })
    const remove = group.add(element)
    try {
        const snapshot = group.capture()
        element.style.left = '80px'
        element.style.top = '30px'
        const result = await group.play(snapshot)
        expectEqual(result, 'ended', 'position result')
        const rect = element.getBoundingClientRect()
        const origin = root.getBoundingClientRect()
        expectClose(rect.left - origin.left, 80, 0.6, 'final left')
        expectClose(rect.top - origin.top, 30, 0.6, 'final top')
        expectEqual(element.getAnimations().length, 0, 'settled animations')
        return 'position FLIP: ended, final box exact, no residual animation'
    } finally {
        remove()
        group.dispose()
        root.remove()
    }
}

export async function L2(): Promise<string> {
    const root = stage()
    const element = box(
        root,
        'left: 10px; top: 10px; width: 100px; height: 50px;'
    )
    const group = createLayoutGroup({ motion: { duration: 0.12 } })
    const remove = group.add(element, { layout: 'box' })
    try {
        const snapshot = group.capture()
        element.style.width = '50px'
        element.style.height = '25px'
        const result = await group.play(snapshot)
        expectEqual(result, 'ended', 'box result')
        const rect = element.getBoundingClientRect()
        expectClose(rect.width, 50, 0.6, 'final width')
        expectClose(rect.height, 25, 0.6, 'final height')
        expectEqual(element.getAnimations().length, 0, 'settled animations')
        return 'box FLIP: ended, scale settles to exact layout, no residual animation'
    } finally {
        remove()
        group.dispose()
        root.remove()
    }
}

export async function L3(): Promise<string> {
    const root = stage()
    const element = box(root, 'left: 0; top: 0; width: 30px; height: 30px;')
    const group = createLayoutGroup()
    const remove = group.add(element)
    try {
        const snapshot = group.capture()
        const result = await group.play(snapshot)
        expectEqual(result, 'no-change', 'no-change result')
        expectEqual(element.getAnimations().length, 0, 'no animations')
        return 'no-change: no animation created'
    } finally {
        remove()
        group.dispose()
        root.remove()
    }
}

export async function L4(): Promise<string> {
    const root = stage()
    const element = box(root, 'left: 0; top: 0; width: 30px; height: 30px;')
    const group = createLayoutGroup()
    const remove = group.add(element)
    try {
        const snapshot = group.capture()
        element.style.left = '60px'
        const result = await group.play(snapshot)
        expectEqual(result, 'reduced', 'reduced result')
        expectEqual(element.getAnimations().length, 0, 'no animations')
        expectClose(
            element.getBoundingClientRect().left -
                root.getBoundingClientRect().left,
            60,
            0.6,
            'final left'
        )
        return 'reduced motion: snap, no animation'
    } finally {
        remove()
        group.dispose()
        root.remove()
    }
}

export async function L5(): Promise<string> {
    const root = stage()
    const element = box(root, 'left: 0; top: 0; width: 30px; height: 30px;')
    const group = createLayoutGroup({ maxAnimated: 1 })
    const first = group.add(element)
    const extra = box(root, 'left: 80px; top: 0; width: 30px; height: 30px;')
    const second = group.add(extra)
    try {
        const snapshot = group.capture()
        element.style.left = '20px'
        extra.style.left = '100px'
        const result = await group.play(snapshot)
        expectEqual(result, 'capped', 'cap result')
        expectEqual(element.getAnimations().length, 0, 'first no animation')
        expectEqual(extra.getAnimations().length, 0, 'second no animation')
        return 'cap: whole change snapped, no partial list animation'
    } finally {
        first()
        second()
        group.dispose()
        root.remove()
    }
}

export async function L6(): Promise<string> {
    const root = stage()
    const element = box(
        root,
        'left: 0; top: 0; width: 50px; height: 40px; translate: -50% 0px;'
    )
    const group = createLayoutGroup({ motion: { duration: 0.12 } })
    const remove = group.add(element)
    try {
        const snapshot = group.capture()
        element.style.left = '80px'
        const pending = group.play(snapshot)
        const origin = root.getBoundingClientRect()
        const first = element.getBoundingClientRect()
        expectClose(
            first.left - origin.left,
            -25,
            0.6,
            'base translate at start'
        )
        await pending
        const rect = element.getBoundingClientRect()
        expectClose(rect.left - origin.left, 55, 0.6, 'base translate at end')
        expectEqual(element.style.translate, '-50%', 'inline base preserved')
        return 'additive translate composes with a percentage base at start and end'
    } finally {
        remove()
        group.dispose()
        root.remove()
    }
}

export async function L7(): Promise<string> {
    const root = stage()
    const element = box(root, 'left: 0; top: 0; width: 30px; height: 30px;')
    const group = createLayoutGroup({ motion: { duration: 0.12 } })
    const remove = group.add(element)
    try {
        const snapshot = group.capture()
        element.style.left = '90px'
        const pending = group.play(snapshot)
        const origin = root.getBoundingClientRect()
        const first = element.getBoundingClientRect()
        expectClose(first.left - origin.left, 0, 0.6, 'first-frame inverse')
        await pending
        const final = element.getBoundingClientRect()
        expectClose(final.left - origin.left, 90, 0.6, 'final left')
        return 'first frame starts at the before box; final matches layout'
    } finally {
        remove()
        group.dispose()
        root.remove()
    }
}

export async function L8(): Promise<string> {
    const root = stage()
    const element = box(
        root,
        'left: 10px; top: 10px; width: 100px; height: 50px; border-radius: 8px;'
    )
    const group = createLayoutGroup({ motion: { duration: 0.12 } })
    const remove = group.add(element, { layout: 'box' })
    try {
        const snapshot = group.capture()
        element.style.width = '50px'
        element.style.height = '25px'
        const pending = group.play(snapshot)
        const animation = element.getAnimations()[0]
        if (!animation || !(animation.effect instanceof KeyframeEffect)) {
            throw new Error('box animation missing KeyframeEffect')
        }
        const frames = animation.effect.getKeyframes()
        expectClose(
            Number.parseFloat(String(frames[0]?.borderRadius ?? '0')),
            4,
            0.2,
            'start radius correction'
        )
        await pending
        expectClose(
            Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
            8,
            0.2,
            'final radius'
        )
        return 'box radius correction starts scaled and returns to 8px'
    } finally {
        remove()
        group.dispose()
        root.remove()
    }
}

export async function L9(): Promise<string> {
    const root = stage()
    const element = box(root, 'left: 0; top: 0; width: 40px; height: 40px;')
    const unbind = shareElement(element, 'hero')
    try {
        let duringName = ''
        const result = await viewTransition(
            () => {
                duringName = element.style.getPropertyValue(
                    'view-transition-name'
                )
                element.style.left = '40px'
            },
            { share: ['hero'], motion: { duration: 0.12 } }
        )
        if (supportsViewTransition()) {
            if (result === 'unsupported' || result === 'yielded') {
                throw new Error(`supported VT returned ${result}`)
            }
        } else {
            expectEqual(result, 'unsupported', 'unsupported fallback')
        }
        if (result === 'finished') {
            if (!duringName.startsWith('ani-hero')) {
                throw new Error(
                    `shared name missing during transition: ${duringName}`
                )
            }
        }
        expectEqual(
            element.style.getPropertyValue('view-transition-name'),
            '',
            'name restored'
        )
        const origin = root.getBoundingClientRect()
        expectClose(
            element.getBoundingClientRect().left - origin.left,
            40,
            0.6,
            'view transition update'
        )
        return `view transition: ${result}`
    } finally {
        unbind()
        root.remove()
    }
}
