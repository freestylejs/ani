import { createClock } from '@freestylejs/ani-core'
import {
    createManualClockWith,
    trackListeners,
    trackSubscriptions,
} from '../../../core/src/__tests__/integration/harness'

export { trackListeners, trackSubscriptions }

export const createManualClock = (
    options?: Parameters<typeof createManualClockWith>[1]
) => createManualClockWith(createClock, options)
