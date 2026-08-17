import { animateElement, createPlayback } from "../core/playback"
import { applyStyles } from "../core/styles"
import type { Playback } from "../core/types"
import type { Rect } from "../rect/types"
import { computeFlight } from "../shared-element/math"

export const SEND_FLIGHT_MS: number = 200
export const SEND_FLIGHT_EASING: string = "ease"

export type SendFlightOptions = {
    host: HTMLElement
    from: Rect
    to: Rect
    node?: HTMLElement
    imageUrl?: string | null
    durationMs?: number
    easing?: string
}

function startTransform(tx: number, ty: number, sx: number, sy: number): string {
    return `translate3d(${tx}px, ${ty}px, 0) scale(${sx}, ${sy})`
}

function createImageClone(imageUrl: string): HTMLElement {
    let img = document.createElement("img")
    img.src = imageUrl
    img.alt = ""
    img.draggable = false
    return img
}

export function playSendFlight(options: SendFlightOptions): Playback | null {
    let flight = computeFlight(options.from, options.to)
    if (!flight) return null

    let clone = options.node
        ? (options.node.cloneNode(true) as HTMLElement)
        : createImageClone(options.imageUrl ?? "")
    applyStyles(clone, {
        position: "fixed",
        top: `${flight.to.top}px`,
        left: `${flight.to.left}px`,
        width: `${flight.to.width}px`,
        height: `${flight.to.height}px`,
        "transform-origin": "center center",
        "pointer-events": "none",
        "z-index": "2147483646",
        transform: startTransform(flight.fromTranslateX, flight.fromTranslateY, flight.fromScaleX, flight.fromScaleY),
    })
    options.host.appendChild(clone)

    let { playback, resolve } = createPlayback()
    let durationMs = options.durationMs ?? SEND_FLIGHT_MS
    let easing = options.easing ?? SEND_FLIGHT_EASING
    let fromTransform = startTransform(
        flight.fromTranslateX,
        flight.fromTranslateY,
        flight.fromScaleX,
        flight.fromScaleY,
    )
    let anim = animateElement(
        clone,
        [
            { transform: fromTransform },
            { transform: "translate3d(0, 0, 0) scale(1, 1)" },
        ],
        { duration: durationMs, easing, fill: "forwards" },
    )

    let teardown = (): void => {
        if (clone.parentNode) clone.remove()
    }

    let cancel = playback.cancel
    playback.cancel = () => {
        anim?.cancel()
        teardown()
        cancel()
    }

    let finish = (ran: boolean): void => {
        teardown()
        resolve(ran)
    }

    if (!anim) {
        finish(true)
        return playback
    }

    void anim.finished.then(
        () => finish(true),
        () => finish(false),
    )
    return playback
}
