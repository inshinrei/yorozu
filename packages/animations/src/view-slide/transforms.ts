import type { Key } from "../core/types"

export type SlideDirection = "forward" | "back"
export type ViewSlideMode = "push" | "crossfade" | "none"
export type ViewSlideMountPolicy = "keep-visited" | "active-plus-leaving"
export type PanelRole = "entering" | "leaving" | "active" | "idle"

export type SlidePanelState = { transform: string; opacity: string }
export type SlideTransforms = {
    fromStart: SlidePanelState
    fromEnd: SlidePanelState
    toStart: SlidePanelState
    toEnd: SlidePanelState
}

export const VIEW_SLIDE_FADE_OFFSET: string = "1.5rem"

export function slideDirectionByIndex(from: Key, to: Key, items: readonly { id: Key }[]): SlideDirection | null {
    let fromIndex = items.findIndex((item) => item.id === from)
    let toIndex = items.findIndex((item) => item.id === to)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null
    return toIndex > fromIndex ? "forward" : "back"
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
