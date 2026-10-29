import type { VariantRunOptions } from '../types.ts'
import {
    runCostShapes,
    runFloorAudit,
    runHeldAudit,
    runSceneCostProbe,
} from './cost.ts'
import { AccScene } from './scenes/s_acc.tsx'
import { BulkScene } from './scenes/s_bulk.ts'
import { CardScene } from './scenes/s_card.ts'
import { DeleteScene } from './scenes/s_delete.tsx'
import { InsertScene } from './scenes/s_insert.tsx'
import { IslandScene } from './scenes/s_island.ts'
import { PhotoScene } from './scenes/s_photo.ts'
import { ReorderScene } from './scenes/s_reorder.ts'
import { SegScene } from './scenes/s_seg.ts'
import { SheetScene } from './scenes/s_sheet.ts'
import { StackScene } from './scenes/s_stack.ts'

interface BenchScene {
    runManual(options?: {
        control?: string
        variant?: VariantRunOptions
    }): Promise<unknown>
    runReal(options?: { variant?: VariantRunOptions }): Promise<unknown>
    demo(): Promise<void>
}

interface BenchPage {
    readonly ready: boolean
    readonly scenes: Record<string, BenchScene>
    demo(name: string): Promise<void>
    runCost(): Promise<unknown>
    runFloorAudit(extraRead?: boolean): Promise<unknown>
    runHeldAudit(extraRead?: boolean): Promise<unknown>
    runSceneCostProbe(scene: string): Promise<unknown>
}

declare global {
    interface Window {
        __bench?: BenchPage
    }
}

const scenes: Record<string, BenchScene> = {
    's-card': CardScene,
    's-seg': SegScene,
    's-acc': AccScene,
    's-delete': DeleteScene,
    's-insert': InsertScene,
    's-island': IslandScene,
    's-photo': PhotoScene,
    's-stack': StackScene,
    's-reorder': ReorderScene,
    's-sheet': SheetScene,
    's-bulk': BulkScene,
}

window.__bench = {
    ready: true,
    scenes,
    async demo(name: string) {
        const scene = scenes[name]
        if (!scene) throw new Error(`unknown scene "${name}"`)
        await scene.demo()
    },
    runCost: runCostShapes,
    runFloorAudit,
    runHeldAudit,
    async runSceneCostProbe(scene: string) {
        if (scene === 's-card') {
            return runSceneCostProbe('s-card', 7, 6, {
                type: 'spring',
                duration: 0.55,
                bounce: 0.05,
            })
        }
        if (scene === 's-seg') {
            return runSceneCostProbe('s-seg', 1, 1, {
                type: 'spring',
                duration: 0.35,
                bounce: 0.12,
            })
        }
        if (scene === 's-acc') {
            return runSceneCostProbe('s-acc', 43, 34, {
                type: 'spring',
                duration: 0.5,
                bounce: 0.06,
            })
        }
        if (scene === 's-delete') {
            return runSceneCostProbe('s-delete', 9, 9, {
                type: 'spring',
                duration: 0.45,
                bounce: 0.08,
            })
        }
        if (scene === 's-insert') {
            return runSceneCostProbe('s-insert', 16, 13, {
                type: 'spring',
                duration: 0.5,
                bounce: 0.05,
            })
        }
        if (scene === 's-island') {
            return runSceneCostProbe('s-island', 4, 2, {
                type: 'spring',
                duration: 0.5,
                bounce: 0.1,
            })
        }
        if (scene === 's-photo') {
            return runSceneCostProbe('s-photo', 301, 2, {
                type: 'spring',
                duration: 0.45,
                bounce: 0,
            })
        }
        if (scene === 's-stack') {
            return runSceneCostProbe('s-stack', 12, 12, {
                type: 'spring',
                duration: 0.55,
                bounce: 0.08,
            })
        }
        if (scene === 's-reorder') {
            return runSceneCostProbe('s-reorder', 14, 14, {
                type: 'spring',
                duration: 0.45,
                bounce: 0.1,
            })
        }
        if (scene === 's-sheet') {
            return runSceneCostProbe('s-sheet', 1, 1, {
                type: 'spring',
                duration: 0.45,
                bounce: 0.08,
            })
        }
        if (scene === 's-bulk') {
            return runSceneCostProbe('s-bulk', 1000, 300, {
                type: 'spring',
                duration: 0.4,
                bounce: 0.1,
            })
        }
        throw new Error(`no scene cost probe for "${scene}"`)
    },
}
