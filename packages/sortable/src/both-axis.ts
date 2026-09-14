import { moveItem, toTargetIndex } from "./geometry"
import {
    computeInsertIndexFlow,
    flowRectDelta,
    flowShiftDestIndex,
    readFlowRectSnapshot,
    shiftFlowRects,
    type FlowOffset,
    type FlowRectSnapshot,
} from "./flow-geometry"
import { POINTER_ACTIVATION, SORTABLE_FEEL, type SortableActivation, type SortableFeel } from "./feel"
import { AUTO_SCROLL_MAX_PX_PER_FRAME, AUTO_SCROLL_ZONE_PX, createSortableAutoScroll } from "./auto-scroll"
import { findScrollParent, type SortableItemHandle } from "./session"

export type SortableBothAxisOptions<T> = {
    getItems: () => T[]
    getKey: (item: T, index: number) => string | number
    onReorder?: (items: T[]) => void
    getViewport?: () => HTMLElement | null
    activation?: SortableActivation
    canDragKey?: (key: string | number) => boolean
    onDragEnd?: (reason: "pointerup" | "cancel") => void
    reducedMotion?: () => boolean
    feel?: Partial<SortableFeel>
}

export type SortableBothAxis = {
    get draggingKey(): string | number | null
    get insertIndex(): number | null
    get isActive(): boolean
    get liftScale(): number
    get siblingTransition(): string
    registerItem(node: HTMLElement, key: string | number): SortableItemHandle
    getOffset(key: string | number): FlowOffset
    getOverlayOffset(): FlowOffset
    pointerDown(key: string | number, e: PointerEvent): void
    activate(key: string | number, clientX: number, clientY: number): void
    cancel(): void
    subscribe(listener: () => void): () => void
}

export function createSortableBothAxis<T>(options: SortableBothAxisOptions<T>): SortableBothAxis {
    let activation = options.activation ?? POINTER_ACTIVATION
    let feel: SortableFeel = { ...SORTABLE_FEEL, ...options.feel }

    let draggingKey: string | number | null = null
    let pendingKey: string | number | null = null
    let insertIndex: number | null = null
    let baseItems: T[] = []
    let baseKeys: Array<string | number> = []
    let baseRects: FlowRectSnapshot[] = []
    let itemEls = new Map<string | number, HTMLElement>()
    let listeners = new Set<() => void>()

    let startX = 0
    let startY = 0
    let lastX = 0
    let lastY = 0
    let currentX = 0
    let currentY = 0
    let capturePointerId = -1
    let captureEl: Element | null = null
    let delayTimer: ReturnType<typeof setTimeout> | null = null
    let documentCleanup: (() => void) | null = null

    function notify(): void {
        for (let listener of listeners) listener()
    }

    function onScrolled(): void {
        let nextIdx = computeInsertIndexNow()
        if (nextIdx !== insertIndex) insertIndex = nextIdx
        notify()
    }

    let autoX = createSortableAutoScroll({
        axis: "x",
        zone: AUTO_SCROLL_ZONE_PX,
        maxStep: AUTO_SCROLL_MAX_PX_PER_FRAME,
        getPointer: () => currentX,
        isDragging: () => draggingKey != null,
        onScrolled,
    })
    let autoY = createSortableAutoScroll({
        axis: "y",
        zone: AUTO_SCROLL_ZONE_PX,
        maxStep: AUTO_SCROLL_MAX_PX_PER_FRAME,
        getPointer: () => currentY,
        isDragging: () => draggingKey != null,
        onScrolled,
    })

    function clearDelayTimer(): void {
        if (delayTimer != null) {
            clearTimeout(delayTimer)
            delayTimer = null
        }
    }

    function clearPointerCaptureState(): void {
        capturePointerId = -1
        captureEl = null
    }

    function abortPending(): void {
        pendingKey = null
        clearDelayTimer()
        clearPointerCaptureState()
    }

    function snapshot(): void {
        baseItems = options.getItems().slice()
        baseKeys = baseItems.map((item, i) => options.getKey(item, i))
        baseRects = []
        for (let key of baseKeys) {
            let el = itemEls.get(key)
            if (!el) continue
            baseRects.push(readFlowRectSnapshot(el, key))
        }
    }

    function rectsNow(): FlowRectSnapshot[] {
        return shiftFlowRects(baseRects, -autoX.scrollDelta, -autoY.scrollDelta)
    }

    function computeInsertIndexNow(): number {
        return computeInsertIndexFlow(rectsNow(), currentX, currentY)
    }

    function resolveViewport(): HTMLElement | null {
        let override = options.getViewport?.()
        if (override) return override
        let first = itemEls.values().next().value as HTMLElement | undefined
        if (!first) return null
        return findScrollParent(first, "y") ?? findScrollParent(first, "x")
    }

    function beginAutoScroll(vp: HTMLElement | null): void {
        // Skip an axis with no overflow so kick() does not queue a no-op rAF.
        autoX.begin(vp && vp.scrollWidth > vp.clientWidth ? vp : null)
        autoY.begin(vp && vp.scrollHeight > vp.clientHeight ? vp : null)
    }

    function getOffset(key: string | number): FlowOffset {
        let zero: FlowOffset = { x: 0, y: 0 }
        if (draggingKey == null || insertIndex == null) return zero
        let a = baseKeys.indexOf(draggingKey)
        let i = baseKeys.indexOf(key)
        if (a < 0 || i < 0) return zero
        if (i === a) {
            return {
                x: currentX - startX + autoX.scrollDelta,
                y: currentY - startY + autoY.scrollDelta,
            }
        }
        let dest = flowShiftDestIndex(a, insertIndex, i)
        if (dest == null) return zero
        let from = baseRects[i]
        let to = baseRects[dest]
        if (!from || !to) return zero
        return flowRectDelta(from, to)
    }

    function getOverlayOffset(): FlowOffset {
        if (draggingKey == null) return { x: 0, y: 0 }
        return { x: currentX - startX, y: currentY - startY }
    }

    function reset(): void {
        autoX.stop()
        autoX.begin(null)
        autoY.stop()
        autoY.begin(null)
        draggingKey = null
        insertIndex = null
        baseItems = []
        baseKeys = []
        baseRects = []
        currentX = 0
        currentY = 0
        startX = 0
        startY = 0
        lastX = 0
        lastY = 0
        clearPointerCaptureState()
    }

    function isForeignPointer(e: PointerEvent): boolean {
        return capturePointerId >= 0 && typeof e.pointerId === "number" && e.pointerId !== capturePointerId
    }

    function endDrag(finalIdx: number): void {
        let key = draggingKey
        if (key == null) {
            reset()
            return
        }
        let srcIdx = baseKeys.indexOf(key)
        let to = toTargetIndex(srcIdx, finalIdx)
        let next = srcIdx !== to && srcIdx >= 0 && to >= 0 ? moveItem(baseItems, srcIdx, to) : null
        reset()
        notify()
        try {
            if (next) options.onReorder?.(next)
        } finally {
            options.onDragEnd?.("pointerup")
        }
    }

    function becomeActive(key: string | number): void {
        if (draggingKey != null) return
        if (typeof document === "undefined") return
        if (options.canDragKey && !options.canDragKey(key)) {
            abortPending()
            detachDocumentListeners()
            return
        }
        let itemsNow = options.getItems()
        if (itemsNow.length === 0) return
        pendingKey = null
        clearDelayTimer()
        draggingKey = key
        currentX = lastX
        currentY = lastY
        if (
            capturePointerId >= 0 &&
            captureEl &&
            typeof (captureEl as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture ===
                "function"
        ) {
            try {
                ;(captureEl as Element & { setPointerCapture: (id: number) => void }).setPointerCapture(
                    capturePointerId,
                )
            } catch {
                // Not connected / capture unsupported in this environment.
            }
        }
        snapshot()
        beginAutoScroll(resolveViewport())
        insertIndex = computeInsertIndexNow()
        notify()
        autoX.kick()
        autoY.kick()
    }

    function activate(key: string | number, clientX: number, clientY: number): void {
        if (typeof document === "undefined") return
        if (draggingKey != null) return
        if (options.canDragKey && !options.canDragKey(key)) return
        if (options.getItems().length === 0) return
        abortPending()
        startX = clientX
        startY = clientY
        lastX = clientX
        lastY = clientY
        currentX = clientX
        currentY = clientY
        attachDocumentListeners()
        becomeActive(key)
    }

    function tryActivateFromMove(): void {
        if (pendingKey == null || draggingKey != null) return
        let dx = lastX - startX
        let dy = lastY - startY
        if (activation.delayMs > 0) {
            if (Math.hypot(dx, dy) > activation.delayFailPx) {
                abortPending()
                detachDocumentListeners()
            }
            return
        }
        if (Math.hypot(dx, dy) >= activation.moveThresholdPx) becomeActive(pendingKey)
    }

    function attachDocumentListeners(): void {
        if (typeof document === "undefined" || documentCleanup) return

        let handleMove = (e: PointerEvent) => {
            if (isForeignPointer(e)) return
            lastX = e.clientX
            lastY = e.clientY
            tryActivateFromMove()
            if (draggingKey == null) return
            currentX = lastX
            currentY = lastY
            let nextIdx = computeInsertIndexNow()
            if (nextIdx !== insertIndex) insertIndex = nextIdx
            notify()
            autoX.kick()
            autoY.kick()
        }

        let handleUp = (e: PointerEvent) => {
            if (isForeignPointer(e)) return
            lastX = e.clientX
            lastY = e.clientY
            currentX = lastX
            currentY = lastY
            try {
                if (draggingKey != null) {
                    endDrag(computeInsertIndexNow())
                } else {
                    abortPending()
                }
            } finally {
                detachDocumentListeners()
            }
        }

        let handleCancel = (e: PointerEvent) => {
            if (isForeignPointer(e)) return
            cancel()
        }

        document.addEventListener("pointermove", handleMove)
        document.addEventListener("pointerup", handleUp)
        document.addEventListener("pointercancel", handleCancel)

        documentCleanup = () => {
            document.removeEventListener("pointermove", handleMove)
            document.removeEventListener("pointerup", handleUp)
            document.removeEventListener("pointercancel", handleCancel)
        }
    }

    function detachDocumentListeners(): void {
        if (documentCleanup) {
            documentCleanup()
            documentCleanup = null
        }
    }

    function pointerDown(key: string | number, e: PointerEvent): void {
        if (typeof document === "undefined") return
        if (draggingKey != null || pendingKey != null) return
        if (e.button != null && e.button !== 0) return
        if (options.canDragKey && !options.canDragKey(key)) return
        if (options.getItems().length === 0) return

        pendingKey = key
        startX = e.clientX
        startY = e.clientY
        lastX = startX
        lastY = startY
        currentX = startX
        currentY = startY
        capturePointerId = typeof e.pointerId === "number" ? e.pointerId : -1
        captureEl = e.target instanceof Element ? e.target : null
        attachDocumentListeners()
        if (activation.delayMs > 0) {
            delayTimer = setTimeout(() => {
                delayTimer = null
                if (pendingKey == null || draggingKey != null) return
                becomeActive(pendingKey)
            }, activation.delayMs)
        }
    }

    function cancel(): void {
        let wasActive = draggingKey != null
        abortPending()
        reset()
        detachDocumentListeners()
        if (wasActive) {
            notify()
            options.onDragEnd?.("cancel")
        }
    }

    function registerItem(node: HTMLElement, key: string | number): SortableItemHandle {
        itemEls.set(key, node)
        return {
            update(nextKey: string | number) {
                if (nextKey === key) return
                if (itemEls.get(key) === node) itemEls.delete(key)
                key = nextKey
                itemEls.set(key, node)
            },
            destroy() {
                if (itemEls.get(key) === node) itemEls.delete(key)
            },
        }
    }

    return {
        get draggingKey(): string | number | null {
            return draggingKey
        },
        get insertIndex(): number | null {
            return insertIndex
        },
        get isActive(): boolean {
            return draggingKey != null
        },
        get liftScale(): number {
            if (options.reducedMotion?.()) return 1
            return feel.liftScale
        },
        get siblingTransition(): string {
            if (options.reducedMotion?.()) return "none"
            return `${feel.siblingMs}ms ${feel.siblingEase}`
        },
        subscribe(listener: () => void): () => void {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
        registerItem,
        getOffset,
        getOverlayOffset,
        pointerDown,
        activate,
        cancel,
    }
}
