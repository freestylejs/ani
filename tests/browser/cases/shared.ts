import { defaultClock } from '@freestylejs/ani-core'
import {
    computedTranslateX,
    expectClose,
    expectEqual,
    frames,
    styleLog,
    waitFor,
} from './assert.ts'
import { type Driver, INITIAL, pose } from './fixtures.ts'

// The case bodies are the same for every framework; a driver only mounts the
// framework's component with the framework's primitives.

const GROUP_SIZE = 200

/** B1: the initial style, a real run, and what the browser computed. */
export async function ref(driver: Driver): Promise<void> {
    const box = driver.mountRef({ node: pose(0.3) })
    const log = styleLog([box.element])
    try {
        const { style } = box.element
        expectEqual(style.transform, 'translateX(0px)', 'initial transform')
        expectEqual(style.opacity, '0.5', 'initial opacity')
        expectEqual(style.length, 2, 'initial inline declarations')

        const result = await box.timeline.play({ from: INITIAL })
        expectEqual(result, 'ended', 'run result')

        const computed = getComputedStyle(box.element)
        expectEqual(computed.transform, 'matrix(1, 0, 0, 1, 100, 0)')
        expectEqual(computed.opacity, '1', 'final opacity')

        const intermediate = new Set(
            log.entries
                .map((entry) => entry.transform)
                .filter((t) => t !== 'translateX(0px)')
                .filter((t) => t !== 'translateX(100px)')
        )
        if (intermediate.size < 3) {
            throw new Error(
                `expected at least 3 intermediate transforms, saw ${intermediate.size}`
            )
        }
    } finally {
        log.stop()
        box.unmount()
    }
}

/** B2: 200 elements on one group commit together, once per frame. */
export async function group(driver: Driver): Promise<void> {
    const list = driver.mountGroup({ node: pose(0.3), count: GROUP_SIZE })
    const log = styleLog(list.elements)
    try {
        expectEqual(list.elements.length, GROUP_SIZE, 'element count')
        const result = await list.group.play({
            from: INITIAL,
            count: GROUP_SIZE,
        })
        expectEqual(result, 'ended', 'run result')

        for (const element of list.elements) {
            expectEqual(element.style.transform, 'translateX(100px)')
            expectEqual(element.style.opacity, '1', 'final opacity')
        }

        const byFrame = log.changedByFrame()
        if (byFrame.size < 3) {
            throw new Error(`only ${byFrame.size} frames wrote styles`)
        }
        for (const [frame, changed] of byFrame) {
            expectEqual(
                changed.size,
                GROUP_SIZE,
                `elements changed in frame ${frame}`
            )
        }
    } finally {
        log.stop()
        list.unmount()
    }
}

/** B3: unmounting stops the writes, disposes the timeline, frees the clock. */
export async function unmount(driver: Driver): Promise<void> {
    const subscribed = defaultClock.size
    const box = driver.mountRef({ node: pose(0.3) })
    const log = styleLog([box.element])
    let mounted = true
    try {
        const run = box.timeline.play({ from: INITIAL, repeat: Infinity })
        await waitFor(
            () => log.entries.length >= 3,
            2000,
            'writes while mounted'
        )
        expectEqual(defaultClock.size, subscribed + 1, 'clock while running')

        box.unmount()
        mounted = false
        const written = log.entries.length
        await frames(5)
        expectEqual(
            log.entries.length,
            written,
            'style mutations after unmount'
        )

        expectEqual(await run, 'disposed', 'run result')
        expectEqual(defaultClock.size, subscribed, 'clock subscribers')
    } finally {
        log.stop()
        if (mounted) box.unmount()
    }
}

/** B4: a transition ends on the element and in the framework's state. */
export async function states(driver: Driver): Promise<void> {
    const machine = driver.mountStates()
    try {
        expectEqual(machine.stateText(), 'idle', 'initial state text')
        expectEqual(machine.element.style.opacity, '0', 'initial opacity')

        const result = await machine.transitionTo('active')
        expectEqual(result, 'ended', 'transition result')
        expectEqual(machine.element.style.opacity, '1', 'final opacity')
        await waitFor(
            () => machine.stateText() === 'active',
            2000,
            'state text reads "active"'
        )
    } finally {
        machine.unmount()
    }
}

/** B5: a follower retargeted mid-motion settles on the new target. */
export async function follow(driver: Driver): Promise<void> {
    const mount = driver.mountFollow()
    try {
        void mount.follower.set({ translateX: 50 })
        await frames(3)
        void mount.follower.set({ translateX: 150 })
        await waitFor(
            () =>
                Math.abs(mount.follower.value.translateX - 150) <= 0.5 &&
                Math.abs(computedTranslateX(mount.element) - 150) <= 0.5,
            5000,
            'follower and element reach translateX 150'
        )
        expectClose(mount.follower.value.translateX, 150, 0.5, 'follower value')
        expectClose(computedTranslateX(mount.element), 150, 0.5, 'element x')
    } finally {
        mount.unmount()
    }
}

/**
 * B6: with `prefers-reduced-motion: reduce` (emulated before the page
 * loads) the default policy jumps and `'ignore'` still animates.
 */
export async function reducedMotion(driver: Driver): Promise<void> {
    expectEqual(
        matchMedia('(prefers-reduced-motion: reduce)').matches,
        true,
        'emulated reduced motion'
    )

    const jumping = driver.mountRef({ node: pose(2) })
    try {
        let result: string | undefined
        void jumping.timeline
            .play({ from: INITIAL })
            .then((value) => (result = value))
        await frames(3)
        expectEqual(result, 'ended', 'default policy result after 3 frames')
        expectEqual(jumping.element.style.transform, 'translateX(100px)')
        expectEqual(jumping.element.style.opacity, '1', 'final opacity')
    } finally {
        jumping.unmount()
    }

    const ignoring = driver.mountRef({ node: pose(2), reducedMotion: 'ignore' })
    try {
        const run = ignoring.timeline.play({ from: INITIAL })
        await frames(5)
        expectEqual(ignoring.timeline.status, 'PLAYING', 'ignore status')
        ignoring.unmount()
        expectEqual(await run, 'disposed', 'ignore run after unmount')
    } finally {
        ignoring.unmount()
    }
}
