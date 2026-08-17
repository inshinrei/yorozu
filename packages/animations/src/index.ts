export type { AttachHandle, Key, Playback } from "./core/types"
export { prefersReducedMotion } from "./core/reduced-motion"
export { dualRaf } from "./core/raf"
export { createPlayback, animateElement } from "./core/playback"
export { applyStyles, clearStyles } from "./core/styles"

export type { Rect, Size, Insets, ObjectFit } from "./rect/types"
export { fitContain, centerFitInViewport } from "./rect/fit"
export type { Flight, OpenFlightOpts, CloseFlightOpts } from "./shared-element/math"
export {
    uncoverByAspect,
    computeFlight,
    resolveNaturalSize,
    computeOpenFlight,
    computeCloseFlight,
    isRectFullyVisibleIn,
    isRectInViewport,
    offViewportLandingRect,
} from "./shared-element/math"
