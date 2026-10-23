// CP2 spike S1 in the `spike_r18c` build variant (see VARIANTS in run.ts).
import { s1Cases } from './spike_s1'

export const pageOptions = {}
export const knownFailures: Record<string, string> = {}

const cases = s1Cases(true)
export const S1_sync = cases.S1_sync
export const S1_transition = cases.S1_transition
export const S1_deferred = cases.S1_deferred
export const S1_suspense = cases.S1_suspense
