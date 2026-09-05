import {
    computeInsertIndex1d,
    moveItem,
    readAxisSnapshot,
    toTargetIndex,
    type AxisSnapshot,
    type SortableAxis,
} from "./geometry"
import { estimateAxisSnapshots } from "./virtual"
import { HOLD_ACTIVATION, POINTER_ACTIVATION, SORTABLE_FEEL, type SortableActivation } from "./feel"
import {
    AUTO_SCROLL_MAX_PX_PER_FRAME,
    AUTO_SCROLL_ZONE_PX,
    createSortableAutoScroll,
    pointerOnAxis,
} from "./auto-scroll"

export type { SortableAxis }
export { HOLD_ACTIVATION, POINTER_ACTIVATION, SORTABLE_FEEL, type SortableActivation }

export type SortableSessionOptions<T> = {
    axis: SortableAxis
    getItems: () => T[]
    getKey: (item: T, index: number) => string | number
    onReorder?: (items: T[]) => void
    getViewport?: () => HTMLElement | null
    getItemSize?: () => number
    autoScrollZonePx?: number
    autoScrollMaxPxPerFrame?: number
    activation?: SortableActivation
    canDragKey?: (key: string | number) => boolean
    onDragEnd?: (reason: "pointerup" | "cancel") => void
}

export type SortableItemHandle = {
    update(key: string | number): void
    destroy(): void
}

export type SortableSession = {
    get draggingKey(): string | number | null
    get insertIndex(): number | null
    get isActive(): boolean
    get liftScale(): number
    subscribe(listener: () => void): () => void
    registerItem(node: HTMLElement, key: string | number): SortableItemHandle
    getOffset(key: string | number): number
    getOverlayOffset(): number
    pointerDown(key: string | number, e: PointerEvent): void
    activate(key: string | number, clientX: number, clientY: number): void
    cancel(): void
}

export function findScrollParent(el: HTMLElement | null, axis: SortableAxis = "y"): HTMLElement | null {
    let node = el?.parentElement ?? null
    while (node) {
        let style = getComputedStyle(node)
        let overflow = axis === "y" ? style.overflowY : style.overflowX
        let overflowing =
            axis === "y" ? node.scrollHeight > node.clientHeight + 1 : node.scrollWidth > node.clientWidth + 1
        if ((overflow === "auto" || overflow === "scroll" || overflow === "overlay") && overflowing) {
            return node
        }
        node = node.parentElement
    }
    return null
}

export function createSortableSession<T>(options: SortableSessionOptions<T>): SortableSession {
    let axis = options.axis
    let zone = options.autoScrollZonePx ?? AUTO_SCROLL_ZONE_PX
    let maxStep = options.autoScrollMaxPxPerFrame ?? AUTO_SCROLL_MAX_PX_PER_FRAME
    let activation = options.activation ?? POINTER_ACTIVATION

    let draggingKey: string | number | null = null
    let pendingKey: string | number | null = null
    let insertIndex: number | null = null
    let baseItems: T[] = []
    let baseKeys: Array<string | number> = []
    let snapshots: AxisSnapshot[] = []
    let measuredItemSize = 0
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

    let autoScroll = createSortableAutoScroll({
        axis,
        zone,
        maxStep,
        getPointer: () => pointerOnAxis(axis, currentX, currentY),
        isDragging: () => draggingKey != null,
        onScrolled: () => {
            let nextIdx = computeInsertIndexNow()
            if (nextIdx !== insertIndex) insertIndex = nextIdx
            notify()
        },
    })

    function notify(): void {
        for (let listener of listeners) listener()
    }

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

    function pointerNow(): number {
        return pointerOnAxis(axis, currentX, currentY)
    }

    function computeInsertIndexNow(): number {
        return computeInsertIndex1d(snapshots, pointerNow() + autoScroll.scrollDelta)
    }

    function resolveItemSize(): number {
        let size = options.getItemSize?.() ?? 0
        if (size > 0) return size
        for (let el of itemEls.values()) {
            let measured = readAxisSnapshot(el, axis, 0).size
            if (measured > 0) return measured
        }
        return 32
    }

    function resolveOriginStart(keys: Array<string | number>, itemSize: number): number {
        for (let i = 0; i < keys.length; i++) {
            let el = itemEls.get(keys[i]!)
            if (!el) continue
            return readAxisSnapshot(el, axis, keys[i]!).start - i * itemSize
        }
        return 0
    }

    function snapshot(): void {
        baseItems = options.getItems().slice()
        baseKeys = baseItems.map((item, i) => options.getKey(item, i))
        measuredItemSize = resolveItemSize()
        snapshots = estimateAxisSnapshots({
            keys: baseKeys,
            itemEls,
            axis,
            itemSize: measuredItemSize,
            originStart: resolveOriginStart(baseKeys, measuredItemSize),
        })
    }

    function resolveViewport(): HTMLElement | null {
        let override = options.getViewport?.()
        if (override) return override
        let first = itemEls.values().next().value as HTMLElement | undefined
        return first ? findScrollParent(first, axis) : null
    }

    function getShift(): number {
        let a = draggingKey == null ? -1 : baseKeys.indexOf(draggingKey)
        let h = (a >= 0 ? snapshots[a]?.size : 0) || measuredItemSize
        let gap = snapshots.length >= 2 ? Math.max(0, snapshots[1]!.start - snapshots[0]!.end) : 0
        return h + gap
    }

    function pointerDelta(): number {
        return pointerNow() - pointerOnAxis(axis, startX, startY)
    }

    function getOffset(key: string | number): number {
        if (draggingKey == null || insertIndex == null) return 0
        let a = baseKeys.indexOf(draggingKey)
        let i = baseKeys.indexOf(key)
        if (a < 0 || i < 0) return 0
        if (i === a) return pointerDelta() + autoScroll.scrollDelta
        let o = toTargetIndex(a, insertIndex)
        let shift = getShift()
        if (i > a && i <= o) return -shift
        if (i < a && i >= o) return shift
        return 0
    }

    function getOverlayOffset(): number {
        if (draggingKey == null) return 0
        return pointerDelta()
    }

    function reset(): void {
        autoScroll.stop()
        autoScroll.begin(null)
        draggingKey = null
        insertIndex = null
        baseItems = []
        baseKeys = []
        snapshots = []
        measuredItemSize = 0
        currentX = 0
        currentY = 0
        startX = 0
        startY = 0
        lastX = 0
        lastY = 0
        clearPointerCaptureState()
    }

    function endDrag(finalIdx: number): void {
        let key = draggingKey
        if (key == null) {
            reset()
            return
        }
        let srcIdx = baseKeys.indexOf(key)
        let to = toTargetIndex(srcIdx, finalIdx)
        if (srcIdx !== to && srcIdx >= 0 && to >= 0) {
            options.onReorder?.(moveItem(baseItems, srcIdx, to))
        }
        reset()
        notify()
        options.onDragEnd?.("pointerup")
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
        autoScroll.begin(resolveViewport())
        insertIndex = computeInsertIndexNow()
        notify()
        autoScroll.kick()
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
        let axisDelta = pointerOnAxis(axis, lastX, lastY) - pointerOnAxis(axis, startX, startY)
        if (Math.abs(axisDelta) >= activation.moveThresholdPx) becomeActive(pendingKey)
    }

    function attachDocumentListeners(): void {
        if (typeof document === "undefined" || documentCleanup) return

        let handleMove = (e: PointerEvent) => {
            lastX = e.clientX
            lastY = e.clientY
            tryActivateFromMove()
            if (draggingKey == null) return
            currentX = lastX
            currentY = lastY
            let nextIdx = computeInsertIndexNow()
            if (nextIdx !== insertIndex) insertIndex = nextIdx
            notify()
            autoScroll.kick()
        }

        let handleUp = (e: PointerEvent) => {
            lastX = e.clientX
            lastY = e.clientY
            currentX = lastX
            currentY = lastY
            if (draggingKey != null) {
                endDrag(computeInsertIndexNow())
            } else {
                abortPending()
            }
            detachDocumentListeners()
        }

        let handleCancel = () => {
            cancel()
        }

        document.addEventListener("pointermove", handleMove)
        document.addEventListener("pointerup", handleUp, { once: true })
        document.addEventListener("pointercancel", handleCancel, { once: true })

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
            return SORTABLE_FEEL.liftScale
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
