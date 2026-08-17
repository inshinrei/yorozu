export type { AttachHandle, Key, Playback } from "./core/types"
export { prefersReducedMotion } from "./core/reduced-motion"
export { dualRaf } from "./core/raf"
export type { AnimationLevel } from "./core/level"
export {
    ANIMATION_LEVELS,
    DEFAULT_ANIMATION_LEVEL,
    isAnimationLevel,
    parseAnimationLevel,
    defaultAnimationLevel,
    cycleAnimationLevel,
    canAnimate,
    pickAnimationLevelFromRatio,
    stepAnimationLevel,
} from "./core/level"
export type { TweenOptions } from "./core/tween"
export { easeOutCubic, lerp, tween } from "./core/tween"

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
    ViewSlideKind,
    ViewSlideMountPolicy,
    PanelRole,
    SlidePanelState,
    SlideTransforms,
} from "./view-slide/transforms"
export {
    VIEW_SLIDE_FADE_OFFSET,
    VIEW_SLIDE_MS,
    VIEW_SLIDE_EASING,
    VIEW_SLIDE_COVER_MS,
    VIEW_SLIDE_COVER_EASING,
    VIEW_SLIDE_ZOOM_MS,
    VIEW_SLIDE_ZOOM_EASING,
    VIEW_SLIDE_REVEAL_MS,
    VIEW_SLIDE_REVEAL_EASING,
    slideDirectionByIndex,
    resolveViewSlideMode,
    viewSlideDurationMs,
    viewSlideEasing,
    viewSlideTransforms,
} from "./view-slide/transforms"
export type { ViewSlideConfig, ViewSlide } from "./view-slide/session"
export { VIEW_SLIDE_SETTLE_SLACK_MS, createViewSlide } from "./view-slide/session"

export type { SlidingIndicator, SlidingIndicatorOptions } from "./sliding-indicator/indicator"
export {
    INDICATOR_MS,
    INDICATOR_EASING,
    createSlidingIndicator,
} from "./sliding-indicator/indicator"

export type { ReorderAnimKind, OrderDiffByKey } from "./list-reorder/classify"
export { buildOrderDiff, classifyReorderAnim } from "./list-reorder/classify"
export type { ListReorder } from "./list-reorder/reorder"
export {
    LIST_REORDER_MS,
    LIST_REORDER_EASING,
    LIST_REORDER_EPSILON_PX,
    createListReorder,
} from "./list-reorder/reorder"

export type { Fade, FadeOptions } from "./fade/fade"
export { FADE_MS, FADE_EASING, createFade } from "./fade/fade"

export type {
    Dock,
    DockConfig,
    DockEdge,
    DockHandle,
    DockMode,
    DockPanelState,
    DockTransforms,
} from "./dock/dock"
export { DOCK_EASING, DOCK_FADE_OFFSET, DOCK_MS, createDock, dockTransforms } from "./dock/dock"

export type { Popover, PopoverPlayOptions } from "./popover/popover"
export { POPOVER_EASING, POPOVER_MS, POPOVER_ORIGIN, createPopover } from "./popover/popover"

export type { DigitSlot } from "./digit-flip/slots"
export {
    DIGIT_FLIP_MS,
    MAX_SIMULTANEOUS_DIGIT_FLIPS,
    buildDigitSlots,
    formatCounterText,
    scheduleDigitFlip,
    shouldPresencePop,
} from "./digit-flip/slots"
export {
    DIGIT_FLIP_EASING,
    PRESENCE_POP_EASING,
    PRESENCE_POP_MS,
    playDigitFlip,
    playPresencePop,
} from "./digit-flip/play"

export type { SendFlightOptions } from "./send-flight/flight"
export { SEND_FLIGHT_EASING, SEND_FLIGHT_MS, playSendFlight } from "./send-flight/flight"

export type { SwipeReveal, SwipeRevealOptions } from "./swipe-reveal/swipe"
export {
    SWIPE_MAX,
    SWIPE_THRESHOLD,
    SWIPE_TWEEN_MS,
    createSwipeReveal,
    rubberSwipeOffset,
    shouldCommitSwipe,
} from "./swipe-reveal/swipe"

export type { ScrollTweenOptions } from "./scroll-tween/scroll"
export { SCROLL_TWEEN_MS, playScrollTween } from "./scroll-tween/scroll"

export type { RippleOptions } from "./ripple/ripple"
export { RIPPLE_COLOR, RIPPLE_EASING, RIPPLE_MS, RIPPLE_SIZE_PX, playRipple } from "./ripple/ripple"
