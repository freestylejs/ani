import { createElement as h, useState } from 'react'
import { SwitchFixture } from '../../../packages/web/src/components/layout_examples'
import {
    CardFixture,
    FolderFixture,
} from '../../../packages/web/src/components/layout_fixtures'
import { nextFrame, waitFor } from './assert'
import { mountRoot } from './layout_frames'

function StatefulSwitch() {
    const [on, setOn] = useState<readonly boolean[]>([false, false, false])
    return h(SwitchFixture, {
        on,
        onToggle: (index: number) =>
            setOn((current) =>
                current.map((value, i) => (i === index ? !value : value))
            ),
    })
}

function StatefulProductScenes() {
    const [folderOpen, setFolderOpen] = useState(false)
    const [cardOpen, setCardOpen] = useState<number | null>(null)
    return h(
        'div',
        null,
        h(
            'button',
            {
                type: 'button',
                'data-qualification-action': 'folder',
                onClick: () => setFolderOpen((open) => !open),
            },
            'Toggle folder'
        ),
        h(FolderFixture, { open: folderOpen }),
        h(
            'button',
            {
                type: 'button',
                'data-qualification-action': 'card',
                onClick: () =>
                    setCardOpen((open) => (open === null ? 0 : null)),
            },
            'Toggle card'
        ),
        h(CardFixture, { open: cardOpen })
    )
}

function required<T>(value: T | null, message: string): T {
    if (value === null) throw new Error(message)
    return value
}

function percentile(values: readonly number[], q: number): number {
    if (values.length === 0) throw new Error('no cadence samples')
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(q * sorted.length) - 1)
    )
    return sorted[index]!
}

async function timestamps(count: number): Promise<number[]> {
    const out: number[] = []
    for (let i = 0; i < count; i++) out.push(await nextFrame())
    return out
}

export async function RAF_CADENCE_PROXY(): Promise<string> {
    const view = mountRoot()
    let observer: MutationObserver | null = null
    try {
        await view.render(h(StatefulSwitch))
        await nextFrame()

        const button = required(
            view.host.querySelector<HTMLButtonElement>('button[role="switch"]'),
            'switch button missing'
        )
        const knob = required(
            view.host.querySelector<HTMLElement>('[data-lk="switch-0"]'),
            'switch layout participant missing'
        )
        let styleMutations = 0
        observer = new MutationObserver((records) => {
            styleMutations += records.length
        })
        observer.observe(knob, {
            attributes: true,
            attributeFilter: ['style'],
        })

        button.click()
        const sampled = await timestamps(31)
        styleMutations += observer.takeRecords().length
        if (styleMutations === 0) {
            throw new Error('product switch produced no layout style mutations')
        }

        const intervals = sampled
            .slice(1)
            .map((timestamp, index) => timestamp - sampled[index]!)
        const median = percentile(intervals, 0.5)
        const p95 = percentile(intervals, 0.95)
        const max = Math.max(...intervals)
        return [
            'proxy-only browser rAF callback cadence; not display presentation',
            'scene=SwitchFixture toggle',
            `samples=${intervals.length}`,
            `median_ms=${median.toFixed(3)}`,
            `p95_ms=${p95.toFixed(3)}`,
            `max_ms=${max.toFixed(3)}`,
            `product_style_mutations=${styleMutations}`,
            `dpr=${devicePixelRatio}`,
        ].join('; ')
    } finally {
        observer?.disconnect()
        view.dispose()
    }
}

export async function EVENT_DOM_RESPONSE_PROXY(): Promise<string> {
    const view = mountRoot()
    let observer: MutationObserver | null = null
    try {
        await view.render(h(StatefulSwitch))
        await nextFrame()

        const button = required(
            view.host.querySelector<HTMLButtonElement>('button[role="switch"]'),
            'switch button missing'
        )
        const knob = required(
            view.host.querySelector<HTMLElement>('[data-lk="switch-0"]'),
            'switch layout participant missing'
        )
        const before = button.getAttribute('aria-checked')
        let firstMutationAt: number | null = null
        observer = new MutationObserver((records) => {
            if (firstMutationAt === null && records.length > 0) {
                firstMutationAt = performance.now()
            }
        })
        observer.observe(view.host, {
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-checked', 'style'],
        })

        const started = performance.now()
        button.click()
        await waitFor(
            () =>
                button.getAttribute('aria-checked') !== before &&
                firstMutationAt !== null &&
                knob.style.translate !== '',
            2000,
            'switch DOM response'
        )

        const elapsed = firstMutationAt! - started
        if (!(elapsed >= 0 && Number.isFinite(elapsed))) {
            throw new Error(`invalid event-to-DOM proxy duration ${elapsed}`)
        }
        return [
            'proxy-only scripted HTMLElement.click to observed DOM/style response',
            'not physical input and not input-to-photon',
            'scene=SwitchFixture toggle',
            'samples=1',
            `first_mutation_ms=${elapsed.toFixed(3)}`,
            `dpr=${devicePixelRatio}`,
        ].join('; ')
    } finally {
        observer?.disconnect()
        view.dispose()
    }
}

export async function PRODUCT_SCENE_COVERAGE_OBSERVATION(): Promise<string> {
    const view = mountRoot()
    let observer: MutationObserver | null = null
    try {
        await view.render(h(StatefulProductScenes))
        await nextFrame()

        const folderButton = required(
            view.host.querySelector<HTMLButtonElement>(
                '[data-qualification-action="folder"]'
            ),
            'folder qualification action missing'
        )
        const cardButton = required(
            view.host.querySelector<HTMLButtonElement>(
                '[data-qualification-action="card"]'
            ),
            'card qualification action missing'
        )
        let folderStyleMutations = 0
        let cardStyleMutations = 0
        observer = new MutationObserver((records) => {
            for (const record of records) {
                const target = record.target
                if (!(target instanceof HTMLElement)) continue
                const layoutKey = target.dataset.lk ?? ''
                const layoutId = target.dataset.layoutId ?? ''
                if (layoutKey.startsWith('folder-')) folderStyleMutations++
                if (layoutId.startsWith('card-')) cardStyleMutations++
            }
        })
        observer.observe(view.host, {
            subtree: true,
            attributes: true,
            attributeFilter: ['style'],
        })

        folderButton.click()
        await waitFor(
            () => folderStyleMutations > 0,
            2000,
            'folder product layout observation'
        )
        cardButton.click()
        await waitFor(
            () => cardStyleMutations > 0,
            2000,
            'card product layout observation'
        )

        return [
            'bounded product-scene observation; not full native-scene certification',
            'reuses FolderFixture and CardFixture from the web showcase fixtures',
            'scene=FolderFixture + CardFixture',
            `folder_style_mutations=${folderStyleMutations}`,
            `card_style_mutations=${cardStyleMutations}`,
            'no performance threshold applied',
        ].join('; ')
    } finally {
        observer?.disconnect()
        view.dispose()
    }
}
