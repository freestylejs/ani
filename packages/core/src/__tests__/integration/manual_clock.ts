import { createClock } from '../../index'
import { createManualClockWith } from './harness'

export { trackListeners, trackSubscriptions } from './harness'

export const createManualClock = (
    options?: Parameters<typeof createManualClockWith>[1]
) => createManualClockWith(createClock, options)
