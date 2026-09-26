import { MOTION_SETTLE_MS } from "../core/motion-timing"
import { lerp, tween } from "../core/tween"
import type { Playback } from "../core/types"
import { DRAG_LOCK_PX, DRAG_LOCK_RATIO, projectDragOffset, resolveDragAxis, type DragAxis } from "./math"
import { createWheelSession } from "./wheel-session"

export type OffsetDragRelease = {
    axis: DragAxis
    offsetX: number
    offsetY: number
    lastDeltaX: number
    lastDeltaY: number
    from: "pointer" | "wheel" | "cancel"
}

export type OffsetDragConfig = {
    getEnabled: () => boolean
    prefersReducedMotion?: () => boolean
    lockPx?: number
    lockRatio?: number
    wheelQuietPx?: number
    wheelReleaseMs?: number
    wheelCooldownMs?: number
    mapOffset?: (raw: { x: number; y: number; axis: DragAxis }) => { x: number; y: number }
    onChange?: () => void
    onRelease?: (snap: OffsetDragRelease) => void
}

export type OffsetDrag = {
    offsetX: () => number
    offsetY: () => number
    axis: () => DragAxis
    gesturing: () => boolean
    settling: () => boolean
    onPointerDown: (e: PointerEvent) => boolean
    onPointerMove: (e: PointerEvent) => void
    onPointerUp: (e: PointerEvent) => void
    onPointerCancel: (e: PointerEvent) => void
    onWheel: (e: WheelEvent) => boolean
    trapWheel: (e: WheelEvent) => boolean
    setOffset: (x: number, y: number) => void
    settleTo: (x: number, y: number, durationMs?: number) => void
    consumeWheelSession: () => void
    reset: () => void
    destroy: () => void
}

export function createOffsetDrag(config: OffsetDragConfig): OffsetDrag {
    let lockPx = config.lockPx ?? DRAG_LOCK_PX
    let lockRatio = config.lockRatio ?? DRAG_LOCK_RATIO
    let mapOffset =
        config.mapOffset ??
        ((raw: { x: number; y: number; axis: DragAxis }) => projectDragOffset(raw.axis, raw.x, raw.y))

    let offsetX = 0
    let offsetY = 0
    let axis: DragAxis = "none"
    let gesturing = false
    let settling = false
    let destroyed = false
    let hostHandledRelease = false

    let pointerId: number | null = null
    let startClientX = 0
    let startClientY = 0
    let rawX = 0
    let rawY = 0
    let prevRawX = 0
    let prevRawY = 0
    let lastDeltaX = 0
    let lastDeltaY = 0
    let settlePlayback: Playback | null = null

    const notify = (): void => {
        config.onChange?.()
    }

    const applyMapped = (axisLockPx: number = lockPx): void => {
        axis = resolveDragAxis(axis, rawX, rawY, axisLockPx, lockRatio)
        let mapped = mapOffset({ x: rawX, y: rawY, axis })
        offsetX = mapped.x
        offsetY = mapped.y
    }

    const cancelSettle = (): void => {
        if (settlePlayback) {
            settlePlayback.cancel()
            settlePlayback = null
        }
        settling = false
    }

    const clearAccumulator = (): void => {
        rawX = 0
        rawY = 0
        prevRawX = 0
        prevRawY = 0
        lastDeltaX = 0
        lastDeltaY = 0
        startClientX = 0
        startClientY = 0
        axis = "none"
        offsetX = 0
        offsetY = 0
    }

    const settleTo = (x: number, y: number, durationMs?: number): void => {
        hostHandledRelease = true
        if (destroyed) return
        cancelSettle()
        let fromX = offsetX
        let fromY = offsetY
        if (x === 0 && y === 0) axis = "none"
        let duration = config.prefersReducedMotion?.() ? 0 : (durationMs ?? MOTION_SETTLE_MS)
        if (duration <= 0 || (fromX === x && fromY === y)) {
            offsetX = x
            offsetY = y
            settling = false
            notify()
            return
        }
        settling = true
        notify()
        let run = tween({
            from: 0,
            to: 1,
            durationMs: duration,
            onUpdate: (t) => {
                offsetX = lerp(fromX, x, t)
                offsetY = lerp(fromY, y, t)
                if (t >= 1) {
                    offsetX = x
                    offsetY = y
                    settling = false
                    if (settlePlayback === run) settlePlayback = null
                }
                notify()
            },
        })
        settlePlayback = run
    }

    const finishFrom = (from: OffsetDragRelease["from"]): void => {
        if (destroyed) return
        gesturing = false
        pointerId = null
        hostHandledRelease = false
        let snap: OffsetDragRelease = {
            axis,
            offsetX,
            offsetY,
            lastDeltaX,
            lastDeltaY,
            from,
        }
        notify()
        config.onRelease?.(snap)
        if (destroyed || hostHandledRelease) return
        settleTo(0, 0, config.prefersReducedMotion?.() ? 0 : MOTION_SETTLE_MS)
    }

    let wheel = createWheelSession({
        quietPx: config.wheelQuietPx,
        releaseMs: config.wheelReleaseMs,
        cooldownMs: config.wheelCooldownMs,
        onRelease: () => {
            finishFrom("wheel")
        },
    })

    const setOffset = (x: number, y: number): void => {
        if (destroyed) return
        cancelSettle()
        offsetX = x
        offsetY = y
        notify()
    }

    const consumeWheelSession = (): void => {
        if (destroyed) return
        wheel.consume()
    }

    const reset = (): void => {
        hostHandledRelease = true
        if (destroyed) return
        let wasBusy = gesturing || settling || offsetX !== 0 || offsetY !== 0
        cancelSettle()
        wheel.clear()
        pointerId = null
        gesturing = false
        settling = false
        clearAccumulator()
        if (wasBusy) notify()
    }

    const destroy = (): void => {
        hostHandledRelease = true
        if (destroyed) return
        let wasBusy = gesturing || settling || offsetX !== 0 || offsetY !== 0
        cancelSettle()
        wheel.destroy()
        destroyed = true
        pointerId = null
        gesturing = false
        settling = false
        clearAccumulator()
        if (wasBusy) notify()
    }

    const onPointerDown = (event: PointerEvent): boolean => {
        if (destroyed || !config.getEnabled() || event.button !== 0 || pointerId != null) return false
        let displaced = settling || offsetX !== 0 || offsetY !== 0
        cancelSettle()
        if (!wheel.gated()) wheel.clear()
        pointerId = event.pointerId
        if (displaced) {
            rawX = offsetX
            rawY = offsetY
            prevRawX = rawX
            prevRawY = rawY
            lastDeltaX = 0
            lastDeltaY = 0
            startClientX = event.clientX - rawX
            startClientY = event.clientY - rawY
            applyMapped(0)
        } else {
            startClientX = event.clientX
            startClientY = event.clientY
            rawX = 0
            rawY = 0
            prevRawX = 0
            prevRawY = 0
            lastDeltaX = 0
            lastDeltaY = 0
            axis = "none"
            offsetX = 0
            offsetY = 0
        }
        gesturing = true
        try {
            let node = event.currentTarget as Element | null
            node?.setPointerCapture?.(event.pointerId)
        } catch {
            // optional
        }
        notify()
        return true
    }

    const onPointerMove = (event: PointerEvent): void => {
        if (destroyed || pointerId !== event.pointerId || !gesturing) return
        event.preventDefault()
        rawX = event.clientX - startClientX
        rawY = event.clientY - startClientY
        lastDeltaX = rawX - prevRawX
        lastDeltaY = rawY - prevRawY
        prevRawX = rawX
        prevRawY = rawY
        applyMapped()
        notify()
    }

    const onPointerUp = (event: PointerEvent): void => {
        if (destroyed || pointerId !== event.pointerId) return
        finishFrom("pointer")
    }

    const onPointerCancel = (event: PointerEvent): void => {
        if (destroyed || pointerId !== event.pointerId) return
        finishFrom("cancel")
    }

    const onWheel = (event: WheelEvent): boolean => {
        if (destroyed || !config.getEnabled() || event.ctrlKey || event.metaKey) return false
        event.preventDefault()
        event.stopPropagation()
        if (pointerId != null) return true

        let starting = !wheel.active()
        type WheelMomentumEvent = WheelEvent & { momentum?: boolean }
        let ev = event as WheelMomentumEvent
        let kind = wheel.note(event.deltaX, event.deltaY, {
            momentum: typeof ev.momentum === "boolean" ? ev.momentum : undefined,
            timeStamp: event.timeStamp,
        })
        if (kind !== "move") return true

        let displaced = settling || offsetX !== 0 || offsetY !== 0
        if (starting) {
            cancelSettle()
            if (displaced) {
                rawX = offsetX
                rawY = offsetY
                prevRawX = rawX
                prevRawY = rawY
                lastDeltaX = 0
                lastDeltaY = 0
                applyMapped(0)
                gesturing = true
            } else {
                rawX = 0
                rawY = 0
                prevRawX = 0
                prevRawY = 0
                lastDeltaX = 0
                lastDeltaY = 0
                axis = "none"
                offsetX = 0
                offsetY = 0
                gesturing = true
            }
        }

        rawX -= event.deltaX
        rawY -= event.deltaY
        lastDeltaX = -event.deltaX
        lastDeltaY = -event.deltaY
        prevRawX = rawX
        prevRawY = rawY
        // 1d sub-lock ticks must paint; mixed ticks keep 10px / 1.5 lock
        applyMapped(rawX === 0 || rawY === 0 ? 0 : lockPx)
        notify()
        return true
    }

    const trapWheel = (event: WheelEvent): boolean => {
        if (destroyed || !config.getEnabled() || event.ctrlKey || event.metaKey) return false
        event.preventDefault()
        event.stopPropagation()
        onWheel(event)
        return true
    }

    return {
        offsetX: () => offsetX,
        offsetY: () => offsetY,
        axis: () => axis,
        gesturing: () => gesturing,
        settling: () => settling,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
        onWheel,
        trapWheel,
        setOffset,
        settleTo,
        consumeWheelSession,
        reset,
        destroy,
    }
}
