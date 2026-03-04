import { describe, expect, it } from 'vitest'
import { rafTimeline } from '~/ani/raf'
import { webTimeline } from '~/ani/waapi'
import { a } from '~/index'

describe('public api aliases', () => {
    it('should expose explicit timeline engine aliases', () => {
        expect(a.dynamicTimeline).toBe(rafTimeline)
        expect(a.timeline).toBe(webTimeline)
        expect(a.rafTimeline).toBe(rafTimeline)
        expect(a.waapiTimeline).toBe(webTimeline)
        expect(a.webTimeline).toBe(webTimeline)
    })
})
