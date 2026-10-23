// CP2 spike S1 fixture: plain React components (no JSX), compiled by the React
// Compiler in the `spike_rc` / `spike_r18c` variants.
import {
    Component,
    createElement as h,
    memo,
    type ReactNode,
    Suspense,
    useCallback,
    useDeferredValue,
    useLayoutEffect,
    useRef,
    useState,
} from 'react'
import { close, probe, register, touch } from './spike_proto'
import { busy, controls, readResource } from './spike_s1_support'

export interface AppState {
    readonly version: number
    readonly order: readonly number[]
    readonly query: string
    readonly suspend: number
}

function useProtoLayout(): (element: HTMLElement | null) => void {
    touch()
    const unregister = useRef<(() => void) | null>(null)
    useLayoutEffect(() => {
        close()
    })
    return useCallback((element: HTMLElement | null) => {
        unregister.current?.()
        unregister.current = element ? register(element) : null
    }, [])
}

function useProtoGroup(): void {
    touch()
    useLayoutEffect(() => {
        close()
    })
}

class Probe extends Component<{ version: number; deferred: string }> {
    override getSnapshotBeforeUpdate(): null {
        probe()
        return null
    }
    override componentDidUpdate(): void {
        // required for React to call getSnapshotBeforeUpdate
    }
    override render(): ReactNode {
        return null
    }
}

function Item({ id, slot }: { id: number; slot: number }): ReactNode {
    const ref = useProtoLayout()
    return h(
        'li',
        {
            ref,
            style: {
                height: `${18 + (id % 3) * 7.25}px`,
                width: `${120 + slot * 3.5}px`,
                margin: '2px 0',
                background: '#ccd',
                listStyle: 'none',
            },
        },
        String(id)
    )
}

function Slow({ index }: { index: number }): ReactNode {
    busy(3)
    return h('span', null, String(index))
}

const Banner = memo(function Banner(): ReactNode {
    const [tall, setTall] = useState(false)
    useLayoutEffect(() => {
        controls.toggleBanner = () => setTall((value) => !value)
    }, [])
    return h('div', { style: { height: tall ? '37.3px' : '0px' } })
})

function Detail({ suspend }: { suspend: number }): ReactNode {
    const text = readResource(suspend)
    const ref = useProtoLayout()
    return h('p', { ref, style: { height: '24px', margin: 0 } }, text)
}

export function App({ slow }: { slow: boolean }): ReactNode {
    useProtoGroup()
    const [state, setState] = useState<AppState>({
        version: 0,
        order: [0, 1, 2, 3, 4, 5, 6, 7],
        query: '',
        suspend: 0,
    })
    useLayoutEffect(() => {
        controls.setState = setState
    }, [])
    const deferred = useDeferredValue(state.query)
    const visible = state.order.filter(
        (id) => deferred.length === 0 || id % (deferred.length + 1) !== 0
    )
    const slowChildren = slow
        ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((index) =>
              h(Slow, { key: index, index })
          )
        : null
    return h(
        'div',
        null,
        h(Probe, { version: state.version, deferred }),
        h(Banner, null),
        h('input', { readOnly: true, value: state.query }),
        h(
            'ul',
            { style: { padding: 0, margin: 0 } },
            visible.map((id, slot) => h(Item, { key: id, id, slot }))
        ),
        slowChildren,
        h(
            Suspense,
            { fallback: h('p', { style: { height: '10px' } }, 'loading') },
            h(Detail, { suspend: state.suspend })
        )
    )
}
