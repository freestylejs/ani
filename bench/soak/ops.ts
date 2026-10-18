import type { Values } from './core_api.ts'
import type { SubjectSpec } from './spec.ts'

export type Keyframes = Array<Values | 'keep'>

/**
 * One step of a run. Ops are plain data and never consult the RNG when they
 * execute, so a recorded op list replays exactly. Ops that name an object that
 * is gone (a reduced replay) do nothing.
 */
export type Op =
    | { k: 'create'; id: number; watched: boolean; spec: SubjectSpec }
    | {
          k: 'play'
          s: number
          from: Values
          // group only: target `i` starts at `from + step * i`
          step: Values | null
          keyframes: Keyframes | null
          repeat: number
          interrupt: boolean
          // milliseconds
          delay: number
      }
    | {
          k: 'transition'
          s: number
          to: number
          from: Values | null
          keyframes: Keyframes | null
          repeat: number
          interrupt: boolean
          delay: number
      }
    | { k: 'set'; s: number; to: Values; velocity: Values | null }
    | { k: 'add'; s: number; delta: Values; velocity: Values | null }
    | { k: 'jump'; s: number; to: Values }
    | { k: 'pause' | 'resume' | 'reset' | 'dispose'; s: number }
    | { k: 'seek'; s: number; time: number }
    // `at`: group `bindAt(at)`; `many`: group `bind` of that many targets
    | {
          k: 'bind'
          s: number
          b: number
          at: number | null
          many: number | null
      }
    | { k: 'unbind'; s: number; b: number }
    | { k: 'sub'; s: number; l: number; seed: number }
    | { k: 'unsub'; s: number; l: number }
    | { k: 'frame' }
    | { k: 'advance'; ms: number }
    | { k: 'hidden'; on: boolean }
    | { k: 'rm'; on: boolean }

export type OpKind = Op['k']

export const OP_KINDS: readonly OpKind[] = [
    'create',
    'play',
    'transition',
    'set',
    'add',
    'jump',
    'pause',
    'resume',
    'reset',
    'dispose',
    'seek',
    'bind',
    'unbind',
    'sub',
    'unsub',
    'frame',
    'advance',
    'hidden',
    'rm',
]
