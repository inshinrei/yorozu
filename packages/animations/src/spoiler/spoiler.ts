import { createFade } from "../fade/fade"
import { applyStyles } from "../core/styles"
import type { Playback } from "../core/types"

export const SPOILER_MS: number = 200
export const SPOILER_EASING: string = "ease-out"

const DOT_GAP = 6
const DOT_RADIUS = 1.15

export type SpoilerOptions = {
    revealed: () => boolean
    durationMs?: number
    easing?: string
}

export type Spoiler = {
    reveal: () => Playback
    reset: () => Playback
    destroy: () => void
}

function paintDots(canvas: HTMLCanvasElement): void {
    let ctx = canvas.getContext("2d")
    if (!ctx) return
    let width = canvas.width
    let height = canvas.height
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = "rgba(128, 128, 128, 0.9)"
    for (let y = DOT_GAP / 2; y < height; y += DOT_GAP) {
        for (let x = DOT_GAP / 2; x < width; x += DOT_GAP) {
            ctx.beginPath()
            ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2)
            ctx.fill()
        }
    }
}

export function createSpoiler(el: HTMLElement, options: SpoilerOptions): Spoiler {
    let durationMs = options.durationMs ?? SPOILER_MS
    let easing = options.easing ?? SPOILER_EASING
    let canvas = document.createElement("canvas")
    applyStyles(canvas, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        "pointer-events": "none",
    })
    canvas.width = Math.max(1, el.clientWidth || 1)
    canvas.height = Math.max(1, el.clientHeight || 1)
    paintDots(canvas)
    el.appendChild(canvas)

    let fade = createFade(canvas, { durationMs, easing })
    if (options.revealed()) {
        applyStyles(canvas, { opacity: "0" })
    }

    return {
        reveal: () => fade.setVisible(false),
        reset: () => fade.setVisible(true),
        destroy: () => {
            if (canvas.parentNode) canvas.remove()
        },
    }
}
