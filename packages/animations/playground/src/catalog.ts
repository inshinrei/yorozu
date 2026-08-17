import { mountDigitFlip } from "./testers/digit-flip"
import { mountDock } from "./testers/dock"
import { mountFade } from "./testers/fade"
import { mountListLayer } from "./testers/list-layer"
import { mountListReorder } from "./testers/list-reorder"
import { mountPinchZoom } from "./testers/pinch-zoom"
import { mountPopover } from "./testers/popover"
import { mountPresencePop } from "./testers/presence-pop"
import { mountRipple } from "./testers/ripple"
import { mountScrollTween } from "./testers/scroll-tween"
import { mountSendFlight } from "./testers/send-flight"
import { mountSharedElement } from "./testers/shared-element"
import { mountSlidingIndicator } from "./testers/sliding-indicator"
import { mountSpoiler } from "./testers/spoiler"
import { mountSwipeReveal } from "./testers/swipe-reveal"
import { mountTabs } from "./testers/tabs"
import { mountViewSlide } from "./testers/view-slide"
import { mountViewSlideModes } from "./testers/view-slide-modes"
import { mountWaveform } from "./testers/waveform"

export type CatalogEntry = {
    id: string
    title: string
    description: string
    tags: string[]
    mount: (root: HTMLElement) => () => void
}

export let catalog: CatalogEntry[] = [
    {
        id: "shared-element",
        title: "Shared element",
        description: "Fly a cover thumb into a stage and reverse the flight.",
        tags: ["flight", "clone", "cover"],
        mount: mountSharedElement,
    },
    {
        id: "view-slide",
        title: "View slide",
        description: "Push, crossfade, or skip between stacked panels.",
        tags: ["panels", "push", "crossfade"],
        mount: mountViewSlide,
    },
    {
        id: "sliding-indicator",
        title: "Sliding indicator",
        description: "Move a pill under tabs of uneven width.",
        tags: ["tabs", "indicator", "measure"],
        mount: mountSlidingIndicator,
    },
    {
        id: "list-reorder",
        title: "List reorder",
        description: "Index-based FLIP for fixed-height rows.",
        tags: ["list", "reorder", "flip"],
        mount: mountListReorder,
    },
    {
        id: "tabs",
        title: "Tabs",
        description: "Indicator and view slide on one tab strip.",
        tags: ["tabs", "combined", "indicator"],
        mount: mountTabs,
    },
    {
        id: "list-layer",
        title: "List layer",
        description: "Open a nested list over the current one; reverse to close.",
        tags: ["layer", "cover", "list"],
        mount: mountListLayer,
    },
    {
        id: "peek-slide",
        title: "Peek slide",
        description: "Incoming full-width slide; outgoing eases ~20% back and dims.",
        tags: ["panels", "peek", "slide"],
        mount: (root) => mountViewSlideModes(root, "peek"),
    },
    {
        id: "lift",
        title: "Lift",
        description: "Vertical translate between stacked panels.",
        tags: ["panels", "lift", "vertical"],
        mount: (root) => mountViewSlideModes(root, "lift"),
    },
    {
        id: "zoom",
        title: "Zoom",
        description: "Scale and fade when replacing a stacked panel.",
        tags: ["panels", "zoom", "scale"],
        mount: (root) => mountViewSlideModes(root, "zoom"),
    },
    {
        id: "reveal",
        title: "Reveal",
        description: "Wipe the incoming panel in with clip-path inset.",
        tags: ["panels", "reveal", "clip"],
        mount: (root) => mountViewSlideModes(root, "reveal"),
    },
    {
        id: "dock",
        title: "Dock",
        description: "Open a single panel from the right edge with a backdrop fade.",
        tags: ["dock", "edge", "panel"],
        mount: mountDock,
    },
    {
        id: "fade",
        title: "Fade",
        description: "Opacity-only show and hide.",
        tags: ["fade", "opacity"],
        mount: mountFade,
    },
    {
        id: "popover",
        title: "Popover",
        description: "Scale and fade a menu from its trigger.",
        tags: ["popover", "menu", "scale"],
        mount: mountPopover,
    },
    {
        id: "digit-flip",
        title: "Digit flip",
        description: "Right-aligned char slots rotate on change.",
        tags: ["counter", "flip", "badge"],
        mount: mountDigitFlip,
    },
    {
        id: "presence-pop",
        title: "Presence pop",
        description: "Scale in a badge only on 0 → N.",
        tags: ["badge", "presence", "pop"],
        mount: mountPresencePop,
    },
    {
        id: "send-flight",
        title: "Send flight",
        description: "Fly a clone from the composer to the list insert point.",
        tags: ["flight", "send", "clone"],
        mount: mountSendFlight,
    },
    {
        id: "swipe-reveal",
        title: "Swipe reveal",
        description: "Pointer-driven rubber row that commits past a threshold.",
        tags: ["swipe", "gesture", "row"],
        mount: mountSwipeReveal,
    },
    {
        id: "scroll-tween",
        title: "Scroll tween",
        description: "Animate scrollLeft to a target.",
        tags: ["scroll", "tween"],
        mount: mountScrollTween,
    },
    {
        id: "ripple",
        title: "Ripple",
        description: "Touch ink at the pointer.",
        tags: ["ripple", "ink", "pointer"],
        mount: mountRipple,
    },
    {
        id: "pinch-zoom",
        title: "Pinch zoom",
        description: "Wheel zoom at the cursor; pan when scale is greater than 1.",
        tags: ["zoom", "pan", "wheel"],
        mount: mountPinchZoom,
    },
    {
        id: "waveform",
        title: "Waveform",
        description: "Bars from packed 5-bit samples.",
        tags: ["waveform", "audio", "bars"],
        mount: mountWaveform,
    },
    {
        id: "spoiler",
        title: "Spoiler",
        description: "Dot-field overlay that fades away on reveal.",
        tags: ["spoiler", "overlay", "dots"],
        mount: mountSpoiler,
    },
]
