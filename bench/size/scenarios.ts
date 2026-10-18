/**
 * Bundle size scenario definition.
 */
export interface SizeScenario {
    readonly name: string
    readonly description: string
    readonly entry: string
}

/**
 * Scenarios measured against bundle size budgets.
 */
export const SCENARIOS: readonly SizeScenario[] = [
    {
        name: 'raf-minimal',
        description: 'ani, rafTimeline',
        entry: "import { ani, rafTimeline } from 'core'\nglobalThis.__size_bench__ = [ani, rafTimeline]\n",
    },
    {
        name: 'raf-composition',
        description: 'ani, sequence, parallel, stagger, rafTimeline, timing',
        entry: "import { ani, sequence, parallel, stagger, rafTimeline, timing } from 'core'\nglobalThis.__size_bench__ = [ani, sequence, parallel, stagger, rafTimeline, timing]\n",
    },
    {
        name: 'waapi-minimal',
        description: 'ani, waapiTimeline',
        entry: "import { ani, waapiTimeline } from 'core'\nglobalThis.__size_bench__ = [ani, waapiTimeline]\n",
    },
    {
        name: 'group',
        description: 'ani, rafGroup',
        entry: "import { ani, rafGroup } from 'core'\nglobalThis.__size_bench__ = [ani, rafGroup]\n",
    },
    {
        name: 'follow',
        description: 'follow',
        entry: "import { follow } from 'core'\nglobalThis.__size_bench__ = [follow]\n",
    },
    {
        name: 'states',
        description: 'ani, createStates',
        entry: "import { ani, createStates } from 'core'\nglobalThis.__size_bench__ = [ani, createStates]\n",
    },
    {
        name: 'values-color',
        description: 'color from values',
        entry: "import { color } from 'values'\nglobalThis.__size_bench__ = [color]\n",
    },
    {
        name: 'everything',
        description: 'import * as all from core and reference all',
        entry: "import * as all from 'core'\nglobalThis.__size_bench__ = all\n",
    },
]
