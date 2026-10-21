# @freestylejs/ani-layout

Optional layout and presence layer for ANI 2.

```sh
pnpm add @freestylejs/ani-layout
```

- **Layout** — WAAPI FLIP for interactive position/size changes.
- **View Transitions** — browser-native transitions for discrete route/shared-element swaps.
- **Presence** — keyed exit/re-entry with a watchdog.

```ts
import { createLayoutGroup } from '@freestylejs/ani-layout'

const group = createLayoutGroup({ motion: { duration: 0.3 } })
const remove = group.add(element)
const snapshot = group.capture()

element.style.left = '40px'
await group.play(snapshot)
```

For React, use the opt-in subpath:

```tsx
import {
  AnimatePresence,
  LayoutGroup,
  useLayout,
  usePresence,
} from '@freestylejs/ani-react/layout'
```

Read `ARCHITECTURE.md` for the full ownership, tier, and performance contracts.
