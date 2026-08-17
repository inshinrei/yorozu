import { animateElement, createPlayback } from "../core/playback"
import { dualRaf } from "../core/raf"
import { applyStyles } from "../core/styles"
import type { Playback } from "../core/types"
import type { Insets, ObjectFit, Rect, Size } from "../rect/types"
import {
    computeCloseFlight,
    computeFlight,
    computeOpenFlight,
    isRectInViewport,
    offViewportLandingRect,
    type Flight,
} from "./math"

export const SHARED_ELEMENT_MS: number = 200
export const SHARED_ELEMENT_EASING: string = "ease"
export const SHARED_ELEMENT_END_MS: number = 16

export type SharedElementSeed = {
    rect: Rect
    imageUrl?: string | null
    objectFit?: ObjectFit
    naturalWidth?: number
    naturalHeight?: number
}

export type SharedElementPlayOptions = {
    host: HTMLElement
    from: Rect
    to: Rect
    imageUrl?: string | null
    objectFit?: ObjectFit
    durationMs?: number
    easing?: string
    fadeOut?: boolean
    roundedStart?: boolean
    roundedEnd?: boolean
    hideTarget?: HTMLElement | null
    onLand?: () => void | Promise<void>
}

export type SharedElementController = {
    play: (opts: SharedElementPlayOptions) => Playback | null
    playOpen: (opts: {
        host: HTMLElement
        seed: SharedElementSeed
        viewport?: Size
        insets?: Insets
        to?: Rect | null
        durationMs?: number
        hideTarget?: HTMLElement | null
        onLand?: () => void | Promise<void>
    }) => Playback | null
    playClose: (opts: {
        host: HTMLElement
        fromStage: Rect
        target: SharedElementSeed | null
        imageUrl?: string | null
        fadeOut?: boolean
        durationMs?: number
        viewport?: Size
    }) => Playback | null
    cancel: () => void
}

type Active = {
    clone: HTMLElement
    hideTarget: HTMLElement | null
    hidePrev: string
    settleCancel: () => void
    resolve: (ran: boolean) => void
    isCancelled: () => boolean
    anim: Animation | null
    timer: ReturnType<typeof setTimeout> | null
    finishing: boolean
}

function defaultViewport(override?: Size): Size {
    if (override) return override
    if (typeof window === "undefined") return { width: 0, height: 0 }
    return { width: window.innerWidth, height: window.innerHeight }
}

function createClone(imageUrl: string | null | undefined, objectFit: ObjectFit, roundedStart: boolean): HTMLElement {
    let el = document.createElement("div")
    el.setAttribute("aria-hidden", "true")
    applyStyles(el, {
        position: "fixed",
        "z-index": "2147483646",
        overflow: "hidden",
        "pointer-events": "none",
        "transform-origin": "center center",
        "will-change": "transform, opacity",
        "border-radius": roundedStart ? "12px" : "0",
    })
    let img = document.createElement("img")
    img.draggable = false
    img.alt = ""
    applyStyles(img, {
        display: "block",
        width: "100%",
        height: "100%",
        "object-fit": objectFit,
        "pointer-events": "none",
        "user-select": "none",
    })
    if (imageUrl) img.src = imageUrl
    el.appendChild(img)
    return el
}

function applyStartPose(el: HTMLElement, flight: Flight): void {
    applyStyles(el, {
        top: `${flight.to.top}px`,
        left: `${flight.to.left}px`,
        width: `${flight.to.width}px`,
        height: `${flight.to.height}px`,
        transform: startTransform(flight),
    })
}

function startTransform(flight: Flight): string {
    return `translate3d(${flight.fromTranslateX}px, ${flight.fromTranslateY}px, 0) scale(${flight.fromScaleX}, ${flight.fromScaleY})`
}

export function createSharedElement(): SharedElementController {
    let current: Active | null = null

    let teardownDom = (active: Active): void => {
        if (active.timer != null) {
            clearTimeout(active.timer)
            active.timer = null
        }
        if (active.clone.parentNode) active.clone.remove()
        if (active.hideTarget) active.hideTarget.style.visibility = active.hidePrev
    }

    let abort = (active: Active): void => {
        if (current === active) current = null
        active.anim?.cancel()
        active.anim = null
        teardownDom(active)
        active.settleCancel()
    }

    let cancel = (): void => {
        if (!current) return
        abort(current)
    }

    let start = (opts: SharedElementPlayOptions, flight: Flight): Playback => {
        cancel()
        let { playback, resolve, isCancelled } = createPlayback()
        let objectFit: ObjectFit = opts.objectFit ?? "contain"
        let clone = createClone(opts.imageUrl, objectFit, !!opts.roundedStart)
        let hideTarget = opts.hideTarget ?? null
        let hidePrev = hideTarget?.style.visibility ?? ""
        let durationMs = opts.durationMs ?? SHARED_ELEMENT_MS
        let easing = opts.easing ?? SHARED_ELEMENT_EASING

        let active: Active = {
            clone,
            hideTarget,
            hidePrev,
            settleCancel: playback.cancel,
            resolve,
            isCancelled,
            anim: null,
            timer: null,
            finishing: false,
        }
        current = active

        applyStartPose(clone, flight)
        opts.host.appendChild(clone)
        if (hideTarget) hideTarget.style.visibility = "hidden"

        let handle: Playback = {
            done: playback.done,
            cancel: () => {
                if (current === active) abort(active)
                else playback.cancel()
            },
        }

        let finish = async (ran: boolean): Promise<void> => {
            if (current !== active || active.finishing) return
            if (isCancelled()) {
                abort(active)
                return
            }
            active.finishing = true
            if (active.timer != null) {
                clearTimeout(active.timer)
                active.timer = null
            }
            if (opts.onLand) {
                try {
                    await opts.onLand()
                } catch {
                    // land hooks must not leave the clone stuck
                }
            }
            if (isCancelled() || current !== active) return
            current = null
            teardownDom(active)
            resolve(ran)
        }

        void (async () => {
            await dualRaf()
            if (current !== active) return
            if (isCancelled()) {
                abort(active)
                return
            }

            let fromFrame: Keyframe = { transform: startTransform(flight) }
            let toFrame: Keyframe = { transform: "translate3d(0, 0, 0) scale(1, 1)" }
            if (opts.fadeOut) {
                fromFrame.opacity = "1"
                toFrame.opacity = "0"
            }
            if (opts.roundedStart || opts.roundedEnd) {
                fromFrame.borderRadius = opts.roundedStart ? "12px" : "0px"
                toFrame.borderRadius = opts.roundedEnd ? "12px" : "0px"
            }

            active.anim = animateElement(clone, [fromFrame, toFrame], {
                duration: durationMs,
                easing,
                fill: "forwards",
            })

            active.timer = setTimeout(() => {
                void finish(true)
            }, durationMs + SHARED_ELEMENT_END_MS)

            if (active.anim) {
                void active.anim.finished.then(
                    () => finish(true),
                    () => undefined,
                )
            }
        })()

        return handle
    }

    let play = (opts: SharedElementPlayOptions): Playback | null => {
        let flight = computeFlight(opts.from, opts.to)
        if (!flight) return null
        return start(opts, flight)
    }

    let playOpen = (opts: {
        host: HTMLElement
        seed: SharedElementSeed
        viewport?: Size
        insets?: Insets
        to?: Rect | null
        durationMs?: number
        hideTarget?: HTMLElement | null
        onLand?: () => void | Promise<void>
    }): Playback | null => {
        let flight = computeOpenFlight({
            thumb: opts.seed.rect,
            naturalWidth: opts.seed.naturalWidth,
            naturalHeight: opts.seed.naturalHeight,
            objectFit: opts.seed.objectFit ?? "contain",
            viewport: defaultViewport(opts.viewport),
            insets: opts.insets,
            to: opts.to,
        })
        if (!flight) return null
        return start(
            {
                host: opts.host,
                from: opts.seed.rect,
                to: flight.to,
                imageUrl: opts.seed.imageUrl,
                objectFit: "contain",
                durationMs: opts.durationMs,
                roundedStart: true,
                roundedEnd: false,
                hideTarget: opts.hideTarget,
                onLand: opts.onLand,
            },
            flight,
        )
    }

    let playClose = (opts: {
        host: HTMLElement
        fromStage: Rect
        target: SharedElementSeed | null
        imageUrl?: string | null
        fadeOut?: boolean
        durationMs?: number
        viewport?: Size
    }): Playback | null => {
        let imageUrl = opts.imageUrl ?? opts.target?.imageUrl ?? null
        if (!opts.target) {
            return start(
                {
                    host: opts.host,
                    from: opts.fromStage,
                    to: opts.fromStage,
                    imageUrl,
                    objectFit: "contain",
                    durationMs: opts.durationMs,
                    fadeOut: true,
                    roundedStart: false,
                    roundedEnd: false,
                },
                {
                    to: { ...opts.fromStage },
                    fromTranslateX: 0,
                    fromTranslateY: 0,
                    fromScaleX: 1,
                    fromScaleY: 1,
                },
            )
        }

        let thumb = opts.target.rect
        let viewport = defaultViewport(opts.viewport)
        if (!isRectInViewport(thumb, viewport)) {
            thumb = offViewportLandingRect(opts.fromStage, thumb, viewport.height)
        }
        let objectFit: ObjectFit = opts.target.objectFit ?? "contain"
        let flight = computeCloseFlight({
            fromStage: opts.fromStage,
            thumb,
            objectFit,
        })
        if (!flight) return null
        return start(
            {
                host: opts.host,
                from: opts.fromStage,
                to: flight.to,
                imageUrl,
                objectFit,
                durationMs: opts.durationMs,
                fadeOut: opts.fadeOut ?? false,
                roundedStart: false,
                roundedEnd: true,
            },
            flight,
        )
    }

    return { play, playOpen, playClose, cancel }
}

let defaultController: SharedElementController | null = null

export function playSharedElement(opts: SharedElementPlayOptions): Playback | null {
    if (!defaultController) defaultController = createSharedElement()
    return defaultController.play(opts)
}
