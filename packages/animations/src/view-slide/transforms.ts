import type { AnimationLevel } from "../core/level"
import type { Key } from "../core/types"

export type SlideDirection = "forward" | "back"
export type ViewSlideMode = "push" | "crossfade" | "cover" | "peek" | "lift" | "zoom" | "reveal" | "none"
export type ViewSlideKind = "stack" | "layer"
export type ViewSlideMountPolicy = "keep-visited" | "active-plus-leaving"
export type PanelRole = "entering" | "leaving" | "active" | "idle"

export type SlidePanelState = { transform: string; opacity: string; clipPath?: string }
export type SlideTransforms = {
    fromStart: SlidePanelState
    fromEnd: SlidePanelState
    toStart: SlidePanelState
    toEnd: SlidePanelState
}

export const VIEW_SLIDE_FADE_OFFSET: string = "1.5rem"
export const VIEW_SLIDE_MS: number = 300
export const VIEW_SLIDE_EASING: string = "cubic-bezier(0.25, 1, 0.5, 1)"
export const VIEW_SLIDE_COVER_MS: number = 250
export const VIEW_SLIDE_COVER_EASING: string = "ease-in-out"
export const VIEW_SLIDE_ZOOM_MS: number = 150
export const VIEW_SLIDE_ZOOM_EASING: string = "ease"
export const VIEW_SLIDE_REVEAL_MS: number = 350
export const VIEW_SLIDE_REVEAL_EASING: string = "ease-in"

export function slideDirectionByIndex(from: Key, to: Key, items: readonly { id: Key }[]): SlideDirection | null {
    let fromIndex = items.findIndex((item) => item.id === from)
    let toIndex = items.findIndex((item) => item.id === to)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null
    return toIndex > fromIndex ? "forward" : "back"
}

export function resolveViewSlideMode(level: AnimationLevel, kind: ViewSlideKind): ViewSlideMode {
    if (level === "low") return "none"
    if (level === "med") return "crossfade"
    return kind === "layer" ? "cover" : "push"
}

export function viewSlideDurationMs(mode: Exclude<ViewSlideMode, "none">): number {
    if (mode === "cover") return VIEW_SLIDE_COVER_MS
    if (mode === "zoom") return VIEW_SLIDE_ZOOM_MS
    if (mode === "reveal") return VIEW_SLIDE_REVEAL_MS
    return VIEW_SLIDE_MS
}

export function viewSlideEasing(mode: Exclude<ViewSlideMode, "none">): string {
    if (mode === "cover") return VIEW_SLIDE_COVER_EASING
    if (mode === "zoom") return VIEW_SLIDE_ZOOM_EASING
    if (mode === "reveal") return VIEW_SLIDE_REVEAL_EASING
    return VIEW_SLIDE_EASING
}

export function viewSlideTransforms(direction: SlideDirection, mode: Exclude<ViewSlideMode, "none">): SlideTransforms {
    if (mode === "crossfade") {
        let leave = direction === "forward" ? `-${VIEW_SLIDE_FADE_OFFSET}` : VIEW_SLIDE_FADE_OFFSET
        let enter = direction === "forward" ? VIEW_SLIDE_FADE_OFFSET : `-${VIEW_SLIDE_FADE_OFFSET}`
        return {
            fromStart: { transform: "translate3d(0, 0, 0)", opacity: "1" },
            fromEnd: { transform: `translate3d(${leave}, 0, 0)`, opacity: "0" },
            toStart: { transform: `translate3d(${enter}, 0, 0)`, opacity: "0" },
            toEnd: { transform: "translate3d(0, 0, 0)", opacity: "1" },
        }
    }

    if (mode === "cover") {
        if (direction === "forward") {
            return {
                fromStart: { transform: "scale(1)", opacity: "1" },
                fromEnd: { transform: "scale(0.7)", opacity: "0" },
                toStart: { transform: "translateX(200%)", opacity: "1" },
                toEnd: { transform: "translateX(0)", opacity: "1" },
            }
        }
        return {
            fromStart: { transform: "translateX(0)", opacity: "1" },
            fromEnd: { transform: "translateX(200%)", opacity: "1" },
            toStart: { transform: "scale(0.7)", opacity: "0" },
            toEnd: { transform: "scale(1)", opacity: "1" },
        }
    }

    if (mode === "peek") {
        if (direction === "forward") {
            return {
                fromStart: { transform: "translate3d(0, 0, 0)", opacity: "1" },
                fromEnd: { transform: "translate3d(-20%, 0, 0)", opacity: "0.7" },
                toStart: { transform: "translate3d(100%, 0, 0)", opacity: "1" },
                toEnd: { transform: "translate3d(0, 0, 0)", opacity: "1" },
            }
        }
        return {
            fromStart: { transform: "translate3d(0, 0, 0)", opacity: "1" },
            fromEnd: { transform: "translate3d(100%, 0, 0)", opacity: "1" },
            toStart: { transform: "translate3d(-20%, 0, 0)", opacity: "0.7" },
            toEnd: { transform: "translate3d(0, 0, 0)", opacity: "1" },
        }
    }

    if (mode === "lift") {
        if (direction === "forward") {
            return {
                fromStart: { transform: "translate3d(0, 0, 0)", opacity: "1" },
                fromEnd: { transform: "translate3d(0, -100%, 0)", opacity: "1" },
                toStart: { transform: "translate3d(0, 100%, 0)", opacity: "1" },
                toEnd: { transform: "translate3d(0, 0, 0)", opacity: "1" },
            }
        }
        return {
            fromStart: { transform: "translate3d(0, 0, 0)", opacity: "1" },
            fromEnd: { transform: "translate3d(0, 100%, 0)", opacity: "1" },
            toStart: { transform: "translate3d(0, -100%, 0)", opacity: "1" },
            toEnd: { transform: "translate3d(0, 0, 0)", opacity: "1" },
        }
    }

    if (mode === "zoom") {
        if (direction === "forward") {
            return {
                fromStart: { transform: "scale(1)", opacity: "1" },
                fromEnd: { transform: "scale(0.95)", opacity: "0" },
                toStart: { transform: "scale(1.1)", opacity: "0" },
                toEnd: { transform: "scale(1)", opacity: "1" },
            }
        }
        return {
            fromStart: { transform: "scale(1)", opacity: "1" },
            fromEnd: { transform: "scale(1.1)", opacity: "0" },
            toStart: { transform: "scale(0.95)", opacity: "0" },
            toEnd: { transform: "scale(1)", opacity: "1" },
        }
    }

    if (mode === "reveal") {
        if (direction === "forward") {
            return {
                fromStart: { transform: "translate3d(0, 0, 0)", opacity: "1" },
                fromEnd: { transform: "translate3d(0, 0, 0)", opacity: "1" },
                toStart: { transform: "translate3d(0, 0, 0)", opacity: "1", clipPath: "inset(0 100% 0 0)" },
                toEnd: { transform: "translate3d(0, 0, 0)", opacity: "1", clipPath: "inset(0 0 0 0)" },
            }
        }
        return {
            fromStart: { transform: "translate3d(0, 0, 0)", opacity: "1", clipPath: "inset(0 0 0 0)" },
            fromEnd: { transform: "translate3d(0, 0, 0)", opacity: "1", clipPath: "inset(0 100% 0 0)" },
            toStart: { transform: "translate3d(0, 0, 0)", opacity: "1" },
            toEnd: { transform: "translate3d(0, 0, 0)", opacity: "1" },
        }
    }

    if (direction === "forward") {
        return {
            fromStart: { transform: "translate3d(0, 0, 0)", opacity: "1" },
            fromEnd: { transform: "translate3d(-100%, 0, 0)", opacity: "1" },
            toStart: { transform: "translate3d(100%, 0, 0)", opacity: "1" },
            toEnd: { transform: "translate3d(0, 0, 0)", opacity: "1" },
        }
    }

    return {
        fromStart: { transform: "translate3d(0, 0, 0)", opacity: "1" },
        fromEnd: { transform: "translate3d(100%, 0, 0)", opacity: "1" },
        toStart: { transform: "translate3d(-100%, 0, 0)", opacity: "1" },
        toEnd: { transform: "translate3d(0, 0, 0)", opacity: "1" },
    }
}
