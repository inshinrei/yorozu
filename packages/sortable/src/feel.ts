export type SortableActivation = {
    delayMs: number
    moveThresholdPx: number
    delayFailPx: number
}

export const POINTER_ACTIVATION: SortableActivation = { delayMs: 0, moveThresholdPx: 10, delayFailPx: 4 }
export const HOLD_ACTIVATION: SortableActivation = { delayMs: 200, moveThresholdPx: 10, delayFailPx: 4 }

export type SortableFeel = {
    liftScale: number
    siblingMs: number
    siblingEase: string
}

export const SORTABLE_FEEL: SortableFeel = {
    liftScale: 1.05,
    siblingMs: 250,
    siblingEase: "cubic-bezier(0.42, 0, 0.58, 1)",
}
