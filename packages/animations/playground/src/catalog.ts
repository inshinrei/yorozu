import { mountListReorder } from "./testers/list-reorder"
import { mountSharedElement } from "./testers/shared-element"
import { mountSlidingIndicator } from "./testers/sliding-indicator"
import { mountTabs } from "./testers/tabs"
import { mountViewSlide } from "./testers/view-slide"

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
]
