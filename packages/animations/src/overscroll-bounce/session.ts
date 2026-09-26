import { onAnimationFrame } from "../core/frame"
import { createPlayback } from "../core/playback"
import type { Playback } from "../core/types"
import { createWheelSession, WHEEL_RELEASE_MS } from "../offset-drag/wheel-session"
import {
    OVERSCROLL_COEFF,
    OVERSCROLL_SPRING_DONE_PX,
    OVERSCROLL_SPRING_MAX_MS,
    OVERSCROLL_SPRING_MIN_MS,
    OVERSCROLL_SPRING_V_MAX,
    OVERSCROLL_VELOCITY_ZERO_MS,
    elasticOverscrollAt,
    invertOverscrollVisual,
    overscrollVisual,
    type OverscrollMap,
} from "./math"

export type OverscrollBounceOptions = {
    coeff?: number
    getDurationMs?: () => number
}

export type OverscrollBounce = {
    destroy: () => void
}

function maxScrollOf(el: HTMLElement): number {
    return Math.max(0, el.scrollHeight - el.clientHeight)
}

function atTop(el: HTMLElement): boolean {
    return el.scrollTop <= 0
}

function atBottom(el: HTMLElement): boolean {
    return el.scrollTop >= maxScrollOf(el) - 0.5
}

function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value
}

export function createOverscrollBounce(
    scroller: HTMLElement,
    content: HTMLElement,
    options?: OverscrollBounceOptions,
): OverscrollBounce {
    let raw = 0
    let map: OverscrollMap = "appkit"
    let pointerId: number | null = null
    let lastY = 0
    let destroyed = false
    let captured = false
    let ignoreCoast = false
    let lastVisual = 0
    let lastVisualAt = 0
    let lastV = 0
    let settlePlayback: Playback | null = null
    let stopSettle: () => void = () => {}
    let coeff = options?.coeff ?? OVERSCROLL_COEFF
    const getDurationMs = options?.getDurationMs ?? ((): number => OVERSCROLL_SPRING_MAX_MS)

    const writeToken = (visual: number): void => {
        let token = visual > 0 ? "top" : visual < 0 ? "bottom" : "none"
        if (content.dataset.yorozuOverscroll !== token) content.dataset.yorozuOverscroll = token
    }

    const paint = (nextRaw: number): void => {
        raw = nextRaw
        let visual = overscrollVisual(raw, map, scroller.clientHeight, coeff)
        content.style.transform = visual === 0 ? "" : `translateY(${visual}px)`
        writeToken(visual)
        if (settlePlayback !== null) return
        let now = performance.now()
        if (lastVisualAt > 0) {
            let dt = now - lastVisualAt
            if (dt > 0 && dt < OVERSCROLL_VELOCITY_ZERO_MS) {
                lastV = (visual - lastVisual) / (dt / 1000)
            } else if (dt >= OVERSCROLL_VELOCITY_ZERO_MS) {
                lastV = 0
            }
        }
        lastVisual = visual
        lastVisualAt = now
    }

    const setMap = (next: OverscrollMap): void => {
        if (next === map) return
        let visual = overscrollVisual(raw, map, scroller.clientHeight, coeff)
        map = next
        raw = invertOverscrollVisual(visual, next, scroller.clientHeight, coeff)
    }

    const cancelSettle = (): void => {
        settlePlayback?.cancel()
        settlePlayback = null
        stopSettle()
        stopSettle = () => {}
    }

    const settle = (): void => {
        cancelSettle()
        if (raw === 0) {
            paint(0)
            return
        }
        let durationCap = getDurationMs()
        if (durationCap <= 0) {
            paint(0)
            return
        }
        let x0 = overscrollVisual(raw, map, scroller.clientHeight, coeff)
        let v0 = clamp(lastV, -OVERSCROLL_SPRING_V_MAX, OVERSCROLL_SPRING_V_MAX)
        lastV = 0
        let start = performance.now()
        let maxMs = durationCap > 0 ? Math.min(durationCap, OVERSCROLL_SPRING_MAX_MS) : OVERSCROLL_SPRING_MAX_MS
        let { playback, resolve, isCancelled } = createPlayback()
        settlePlayback = playback
        let tick = (now: number): void => {
            if (isCancelled() || settlePlayback !== playback) {
                stopSettle()
                resolve(false)
                return
            }
            let elapsed = now - start
            let y = elasticOverscrollAt(x0, v0, elapsed / 1000)
            if (x0 !== 0 && Math.sign(y) !== Math.sign(x0)) y = 0
            if ((elapsed > OVERSCROLL_SPRING_MIN_MS && Math.abs(y) < OVERSCROLL_SPRING_DONE_PX) || elapsed >= maxMs) {
                stopSettle()
                settlePlayback = null
                paint(0)
                resolve(true)
                return
            }
            raw = invertOverscrollVisual(y, map, scroller.clientHeight, coeff)
            content.style.transform = `translateY(${y}px)`
            writeToken(y)
        }
        stopSettle = onAnimationFrame(tick)
        playback.cancel = () => {
            stopSettle()
            if (settlePlayback === playback) settlePlayback = null
            resolve(false)
        }
    }

    const wheel = createWheelSession({
        releaseMs: WHEEL_RELEASE_MS,
        onRelease: () => {
            settle()
        },
    })

    const releaseCapture = (id: number): void => {
        if (!captured) return
        captured = false
        try {
            scroller.releasePointerCapture(id)
        } catch {
            // already released
        }
    }

    const onWheel = (event: WheelEvent): void => {
        if (destroyed || pointerId !== null) return
        if (event.ctrlKey || event.metaKey) return
        let onEdge = atTop(scroller) || atBottom(scroller)
        let wouldStart = (event.deltaY < 0 && atTop(scroller)) || (event.deltaY > 0 && atBottom(scroller))
        if (raw === 0 && !wouldStart && !onEdge) return
        if (raw === 0 && !wouldStart && onEdge) return
        let kind = wheel.note(event.deltaX, event.deltaY, {
            momentum: (event as WheelEvent & { momentum?: boolean }).momentum,
            timeStamp: event.timeStamp,
        })
        if (kind === "move") ignoreCoast = false
        if (kind === "gated") {
            if (raw !== 0 || onEdge) event.preventDefault()
            return
        }
        if (kind === "quiet") {
            if (raw !== 0) event.preventDefault()
            return
        }
        if (kind === "coast") {
            if (ignoreCoast) {
                if (raw !== 0 || onEdge) event.preventDefault()
                return
            }
            if (raw !== 0) {
                event.preventDefault()
                ignoreCoast = true
                if (settlePlayback === null) settle()
                return
            }
            if (wouldStart) {
                setMap("appkit")
                event.preventDefault()
                ignoreCoast = true
                cancelSettle()
                let dim = scroller.clientHeight
                paint(clamp(-event.deltaY, -dim, dim))
                settle()
                return
            }
            if (onEdge) event.preventDefault()
            return
        }
        let next = raw - event.deltaY
        if (raw === 0) {
            if (wouldStart) {
                setMap("appkit")
                event.preventDefault()
                cancelSettle()
                paint(next)
            }
            return
        }
        if (next === 0 || Math.sign(next) !== Math.sign(raw)) {
            cancelSettle()
            paint(0)
            wheel.clear()
            ignoreCoast = false
            return
        }
        setMap("appkit")
        event.preventDefault()
        cancelSettle()
        paint(next)
    }

    const onPointerDown = (event: PointerEvent): void => {
        if (destroyed || event.pointerType === "mouse") return
        if (pointerId !== null) return
        pointerId = event.pointerId
        lastY = event.clientY
    }

    const onPointerMove = (event: PointerEvent): void => {
        if (destroyed || event.pointerId !== pointerId) return
        let dy = event.clientY - lastY
        lastY = event.clientY
        if (raw === 0) {
            let outward = (dy > 0 && atTop(scroller)) || (dy < 0 && atBottom(scroller))
            if (!outward) return
            event.preventDefault()
            try {
                scroller.setPointerCapture(pointerId)
                captured = true
            } catch {
                captured = false
            }
            setMap("ios")
            cancelSettle()
            paint(raw + dy)
            return
        }
        let next = raw + dy
        if (next === 0 || Math.sign(next) !== Math.sign(raw)) {
            cancelSettle()
            paint(0)
            releaseCapture(event.pointerId)
            return
        }
        setMap("ios")
        event.preventDefault()
        cancelSettle()
        paint(next)
    }

    const onPointerUp = (event: PointerEvent): void => {
        if (destroyed || event.pointerId !== pointerId) return
        pointerId = null
        releaseCapture(event.pointerId)
        settle()
    }

    let wheelOpts: AddEventListenerOptions = { passive: false, capture: true }
    let moveOpts: AddEventListenerOptions = { passive: false }

    scroller.addEventListener("wheel", onWheel, wheelOpts)
    scroller.addEventListener("pointerdown", onPointerDown)
    scroller.addEventListener("pointerup", onPointerUp)
    scroller.addEventListener("pointercancel", onPointerUp)
    scroller.addEventListener("pointermove", onPointerMove, moveOpts)

    paint(0)

    return {
        destroy: (): void => {
            if (destroyed) return
            destroyed = true
            cancelSettle()
            wheel.destroy()
            scroller.removeEventListener("wheel", onWheel, wheelOpts)
            scroller.removeEventListener("pointerdown", onPointerDown)
            scroller.removeEventListener("pointerup", onPointerUp)
            scroller.removeEventListener("pointercancel", onPointerUp)
            scroller.removeEventListener("pointermove", onPointerMove, moveOpts)
            if (pointerId !== null) releaseCapture(pointerId)
            pointerId = null
            paint(0)
        },
    }
}
