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
export type { SharedElementSeed, SharedElementPlayOptions, SharedElementController } from "./shared-element/player"
export {
    SHARED_ELEMENT_MS,
    SHARED_ELEMENT_EASING,
    SHARED_ELEMENT_END_MS,
    createSharedElement,
    playSharedElement,
} from "./shared-element/player"

export type {
    SlideDirection,
    ViewSlideMode,
    ViewSlideMountPolicy,
    PanelRole,
    SlidePanelState,
    SlideTransforms,
} from "./view-slide/transforms"
export { VIEW_SLIDE_FADE_OFFSET, slideDirectionByIndex, viewSlideTransforms } from "./view-slide/transforms"
export type { ViewSlideConfig, ViewSlide } from "./view-slide/session"
export { VIEW_SLIDE_MS, VIEW_SLIDE_EASING, VIEW_SLIDE_SETTLE_SLACK_MS, createViewSlide } from "./view-slide/session"

export type { SlidingIndicator, SlidingIndicatorOptions } from "./sliding-indicator/indicator"
export {
    INDICATOR_MS,
    INDICATOR_EASING,
    createSlidingIndicator,
} from "./sliding-indicator/indicator"
