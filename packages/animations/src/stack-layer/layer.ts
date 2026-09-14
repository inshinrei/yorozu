import { MOTION_EASE, MOTION_UI_MS } from "../core/motion-timing"
import { animateElement, createPlayback } from "../core/playback"
import { applyStyles, clearStyles } from "../core/styles"
import type { Playback } from "../core/types"

export const STACK_LAYER_MS: number = MOTION_UI_MS
export const STACK_LAYER_EASING: string = MOTION_EASE
export const STACK_LAYER_MAX_BEHIND: number = 4
export const STACK_LAYER_SCALE_STEP: number = 0.05
export const STACK_LAYER_OPACITY_STEP: number = 0.2
export const STACK_LAYER_OFFSET_PX: number = 8

const STYLE_KEYS: readonly string[] = ["will-change", "transform", "opacity", "z-index", "transform-origin"]
const FINISH_CLEAR_KEYS: readonly string[] = ["will-change"]

export type StackAxis = "up" | "down"

export type StackLayerFrame = {
    transform: string
    opacity: string
}

export type StackLayerFrameOptions = {
    scaleStep?: number
    opacityStep?: number
    offsetPx?: number
    maxBehind?: number
    axis?: StackAxis
}

export function stackLayerFrame(depth: number, options?: StackLayerFrameOptions): StackLayerFrame {
    let scaleStep = options?.scaleStep ?? STACK_LAYER_SCALE_STEP
    let opacityStep = options?.opacityStep ?? STACK_LAYER_OPACITY_STEP
    let offsetPx = options?.offsetPx ?? STACK_LAYER_OFFSET_PX
    let maxBehind = options?.maxBehind ?? STACK_LAYER_MAX_BEHIND
    let axis = options?.axis ?? "up"
    let y = depth * offsetPx * (axis === "up" ? -1 : 1)
    let scale = Math.max(0.5, 1 - depth * scaleStep)
    let opacity = depth > maxBehind ? 0 : Math.max(0, 1 - depth * opacityStep)
    return {
        transform: `translateY(${y}px) scale(${scale})`,
        opacity: String(Number(opacity.toFixed(6))),
    }
}

export type StackLayerSetOptions = {
    axis?: StackAxis
    durationMs?: number
    easing?: string
}

export type StackLayerConfig = {
    durationMs?: number
    easing?: string
    scaleStep?: number
    opacityStep?: number
    offsetPx?: number
    maxBehind?: number
}

export type StackLayer = {
    set: (el: HTMLElement, depth: number, options?: StackLayerSetOptions) => Playback
    forget: (el: HTMLElement) => void
    destroy: () => void
}

type Entry = {
    anim: Animation | null
    resolve: ((ran: boolean) => void) | null
    depth: number
    frame: StackLayerFrame
    axis: StackAxis
}

export function createStackLayer(config?: StackLayerConfig): StackLayer {
    let durationMs = config?.durationMs ?? STACK_LAYER_MS
    let easing = config?.easing ?? STACK_LAYER_EASING
    let scaleStep = config?.scaleStep ?? STACK_LAYER_SCALE_STEP
    let opacityStep = config?.opacityStep ?? STACK_LAYER_OPACITY_STEP
    let offsetPx = config?.offsetPx ?? STACK_LAYER_OFFSET_PX
    let maxBehind = config?.maxBehind ?? STACK_LAYER_MAX_BEHIND
    let entries = new Map<HTMLElement, Entry>()

    let frameOptions = (axis: StackAxis): StackLayerFrameOptions => ({
        scaleStep,
        opacityStep,
        offsetPx,
        maxBehind,
        axis,
    })

    let stopEntry = (el: HTMLElement, entry: Entry, clearKeys: readonly string[]): void => {
        entry.anim?.cancel()
        entry.resolve?.(false)
        entry.anim = null
        entry.resolve = null
        clearStyles(el, clearKeys)
    }

    let forget = (el: HTMLElement): void => {
        let entry = entries.get(el)
        if (!entry) return
        stopEntry(el, entry, STYLE_KEYS)
        entries.delete(el)
    }

    let set = (el: HTMLElement, depth: number, options?: StackLayerSetOptions): Playback => {
        let axis = options?.axis ?? "up"
        let runDuration = options?.durationMs ?? durationMs
        let runEasing = options?.easing ?? easing
        let existing = entries.get(el)

        if (existing && existing.depth === depth && existing.axis === axis && !existing.anim && !existing.resolve) {
            let { playback, resolve } = createPlayback()
            resolve(true)
            return playback
        }

        if (existing) {
            stopEntry(el, existing, FINISH_CLEAR_KEYS)
        }

        let opts = frameOptions(axis)
        let to = stackLayerFrame(depth, opts)
        let from = existing?.frame ?? stackLayerFrame(maxBehind + 1, opts)
        let origin = axis === "up" ? "center bottom" : "center top"
        let { playback, resolve, isCancelled } = createPlayback()

        let entry: Entry = {
            anim: null,
            resolve,
            depth,
            frame: to,
            axis,
        }
        entries.set(el, entry)

        applyStyles(el, {
            "transform-origin": origin,
            "z-index": String(100 - depth),
        })

        if (runDuration <= 0) {
            applyStyles(el, { transform: to.transform, opacity: to.opacity })
            entry.resolve = null
            resolve(true)
            return playback
        }

        applyStyles(el, { "will-change": "transform, opacity" })
        let anim = animateElement(el, [from, to], {
            duration: runDuration,
            easing: runEasing,
            fill: "forwards",
        })
        entry.anim = anim

        let finish = (ran: boolean): void => {
            if (entries.get(el) !== entry) return
            entry.anim = null
            entry.resolve = null
            clearStyles(el, FINISH_CLEAR_KEYS)
            applyStyles(el, { transform: to.transform, opacity: to.opacity })
            resolve(ran)
        }

        let cancel = playback.cancel
        playback.cancel = () => {
            if (entries.get(el) === entry) {
                anim?.cancel()
                entry.anim = null
                entry.resolve = null
                clearStyles(el, FINISH_CLEAR_KEYS)
            }
            cancel()
        }

        if (!anim) {
            finish(true)
            return playback
        }

        void anim.finished.then(
            () => finish(true),
            () => {
                if (!isCancelled() && entries.get(el) === entry) finish(false)
            },
        )
        return playback
    }

    let destroy = (): void => {
        for (let el of [...entries.keys()]) forget(el)
    }

    return { set, forget, destroy }
}
