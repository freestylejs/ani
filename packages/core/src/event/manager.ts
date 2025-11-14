import type { Capitalize, PartialRecord, WithPrefix } from '~/utils/types'

export type EventHandler<
    AnimationContext = any,
    EvtKeys extends EventKey = EventKey,
> = (
    animationContext: AnimationContext,
    ev: HTMLElementEventMap[EvtKeys]
) => any

export type EventHandlerRegistration<
    AnimationContext = any,
    Keys extends EventKey = EventKey,
> = PartialRecord<
    WithPrefix<'on', Capitalize<Keys>>,
    EventHandler<AnimationContext, Keys>
>

export type EventKey = keyof HTMLElementEventMap
export class EventManager<
    SupportedEventList extends readonly EventKey[] = EventKey[],
    AnimationContext = any,
> {
    public constructor(public readonly supportedEvents: SupportedEventList) {}

    private _element: HTMLElement | null = null
    public get targetElement(): HTMLElement {
        if (!this._element) throw new Error('EventManger, bind element first')
        return this._element
    }

    private _animeGetter: (() => AnimationContext) | null = null
    public get animeGetter(): () => AnimationContext {
        if (!this._animeGetter)
            throw new Error('EventManager, animeGetter should be provided')
        return this._animeGetter
    }
    public setAnimeGetter = (animeGetter: () => AnimationContext) => {
        this._animeGetter = animeGetter
    }

    private eventMap: Map<
        string,
        (e: HTMLElementEventMap[SupportedEventList[number]]) => void
    > = new Map()

    private withAnimeValue = (
        listener: EventHandler<AnimationContext, SupportedEventList[number]>
    ): ((e: HTMLElementEventMap[SupportedEventList[number]]) => void) => {
        const withAnime = (
            e: HTMLElementEventMap[SupportedEventList[number]]
        ) => {
            listener(this.animeGetter(), e)
        }
        return withAnime
    }

    public add = <const EventName extends SupportedEventList[number]>(
        eventName: EventName,
        listener: EventHandler<AnimationContext, SupportedEventList[number]>,
        options?: boolean | AddEventListenerOptions
    ) => {
        const withAnime = this.withAnimeValue(listener)
        this.eventMap.set(eventName, withAnime)
        this.targetElement.addEventListener<EventName>(
            eventName,
            this.eventMap.get(eventName)!,
            options
        )
    }

    public cleanupOne = <const EventName extends SupportedEventList[number]>(
        eventName: EventName
    ): boolean => {
        const removeListener = this.eventMap.get(eventName)
        if (!removeListener) return false

        this.targetElement.removeEventListener(eventName, removeListener)
        return true
    }

    public cleanupAll = (): boolean => {
        const clearResponse: Array<boolean> = []
        for (const evtName of this.eventMap.keys()) {
            const res = this.cleanupOne(evtName as SupportedEventList[number])
            clearResponse.push(res)
        }
        return clearResponse.some((t) => t === false) === false
    }

    /**
     * get pure `{event_name}`
     * @param key onX`{event_name}`
     */
    public static getEvtKey(key: string): EventKey {
        const removed = key.substring(2, key.length)
        const Capitalized = `${removed[0]!.toLowerCase()}${removed.substring(1, key.length)}`
        return Capitalized as EventKey
    }

    public attach = (
        handlers: EventHandlerRegistration<
            AnimationContext,
            SupportedEventList[number]
        >
    ): void => {
        Object.entries(handlers).forEach(([eventKey, handler]) => {
            this.add(
                EventManager.getEvtKey(eventKey),
                handler as EventHandler<
                    AnimationContext,
                    SupportedEventList[number]
                >
            )
        })
    }

    public bind(element: HTMLElement): void {
        this._element = element
    }
}
