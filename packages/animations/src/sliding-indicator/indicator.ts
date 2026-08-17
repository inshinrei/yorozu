import { animateElement } from "../core/playback"
import { applyStyles } from "../core/styles"

export const INDICATOR_MS: number = 300
export const INDICATOR_EASING: string = "cubic-bezier(0.25, 1, 0.5, 1)"

export type SlidingIndicator = {
    measure: () => void
    destroy: () => void
}

export type SlidingIndicatorOptions = {
    getTrack: () => HTMLElement | null
    getIndicator: () => HTMLElement | null
    getActive: () => HTMLElement | null
    enabled?: () => boolean
    durationMs?: number
    easing?: string
}

function translate3d(left: number, top: number): string {
    return `translate3d(${left}px, ${top}px, 0)`
}

export function createSlidingIndicator(options: SlidingIndicatorOptions): SlidingIndicator {
    let durationMs = options.durationMs ?? INDICATOR_MS
    let easing = options.easing ?? INDICATOR_EASING
    let laidOut = false
    let prevLeft = 0
    let prevTop = 0
    let currentAnim: Animation | null = null
    let destroyed = false
    let observedTrack: HTMLElement | null = null

    let cancelAnim = (): void => {
        if (!currentAnim) return
        currentAnim.cancel()
        currentAnim = null
    }

    let measure = (): void => {
        if (destroyed) return

        let track = options.getTrack()
        if (track && track !== observedTrack) {
            if (observedTrack) observer.unobserve(observedTrack)
            observer.observe(track)
            observedTrack = track
        }

        let indicator = options.getIndicator()
        let active = options.getActive()
        if (!indicator || !active) return

        let left = active.offsetLeft
        let top = active.offsetTop
        let width = active.offsetWidth
        let height = active.offsetHeight
        let next = translate3d(left, top)
        let shouldAnimate = laidOut && (options.enabled?.() ?? true)

        // Size snaps immediately; only transform is tweened.
        applyStyles(indicator, {
            width: `${width}px`,
            height: `${height}px`,
        })

        if (!shouldAnimate) {
            cancelAnim()
            applyStyles(indicator, { transform: next })
            prevLeft = left
            prevTop = top
            laidOut = true
            return
        }

        let from = translate3d(prevLeft, prevTop)
        cancelAnim()
        applyStyles(indicator, { transform: next })
        currentAnim = animateElement(indicator, [{ transform: from }, { transform: next }], {
            duration: durationMs,
            easing,
            fill: "forwards",
        })
        prevLeft = left
        prevTop = top
    }

    let observer = new ResizeObserver((): void => {
        measure()
    })

    let initialTrack = options.getTrack()
    if (initialTrack) {
        observer.observe(initialTrack)
        observedTrack = initialTrack
    }

    let destroy = (): void => {
        if (destroyed) return
        destroyed = true
        cancelAnim()
        observer.disconnect()
        observedTrack = null
    }

    return { measure, destroy }
}
