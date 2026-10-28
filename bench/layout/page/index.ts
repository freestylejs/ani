import { runCostShapes, runFloorAudit, runSceneCostProbe } from './cost.ts'
import { CardScene } from './scenes/s_card.ts'
import { SegScene } from './scenes/s_seg.ts'

interface BenchScene {
    runManual(options?: { control?: string }): Promise<unknown>
    runReal(): Promise<unknown>
    demo(): Promise<void>
}

interface BenchPage {
    readonly ready: boolean
    readonly scenes: Record<string, BenchScene>
    demo(name: string): Promise<void>
    runCost(): Promise<unknown>
    runFloorAudit(extraRead?: boolean): Promise<unknown>
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
        throw new Error(`no scene cost probe for "${scene}"`)
    },
}
