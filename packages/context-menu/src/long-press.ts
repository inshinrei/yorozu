export const MENU_LONG_PRESS_MS: number = 200
export const MENU_LONG_PRESS_SWALLOW_MS: number = 400

export type LongPressBinding = {
    update: (o?: { enabled?: boolean }) => void
    destroy: () => void
}

export function bindLongPress(node: HTMLElement, opts?: { enabled?: boolean }): LongPressBinding {
    let enabled = opts?.enabled !== false
    let pressTimer: ReturnType<typeof setTimeout> | undefined
    let swallowTimer: ReturnType<typeof setTimeout> | undefined
    let attached = false

    function clearPressTimer(): void {
        if (pressTimer != null) {
            clearTimeout(pressTimer)
            pressTimer = undefined
        }
    }

    function removeSwallow(): void {
        if (swallowTimer != null) {
            clearTimeout(swallowTimer)
            swallowTimer = undefined
        }
        node.removeEventListener("touchend", swallow, true)
        node.removeEventListener("click", swallow, true)
    }

    function swallow(event: Event): void {
        event.preventDefault()
        event.stopPropagation()
    }

    function armSwallow(): void {
        removeSwallow()
        node.addEventListener("touchend", swallow, true)
        node.addEventListener("click", swallow, true)
        swallowTimer = setTimeout(() => {
            swallowTimer = undefined
            removeSwallow()
        }, MENU_LONG_PRESS_SWALLOW_MS)
    }

    function onTouchStart(event: TouchEvent): void {
        if (!enabled) return
        clearPressTimer()
        let touch = event.changedTouches[0] ?? event.touches[0]
        if (touch == null) return
        let clientX = touch.clientX
        let clientY = touch.clientY
        pressTimer = setTimeout(() => {
            pressTimer = undefined
            node.dispatchEvent(
                new MouseEvent("contextmenu", {
                    bubbles: true,
                    cancelable: true,
                    clientX,
                    clientY,
                }),
            )
            armSwallow()
        }, MENU_LONG_PRESS_MS)
    }

    function onMousePointerDown(event: PointerEvent): void {
        if (event.pointerType === "mouse") clearPressTimer()
    }

    function attach(): void {
        if (attached) return
        attached = true
        node.addEventListener("touchstart", onTouchStart, { passive: true })
        node.addEventListener("touchmove", clearPressTimer)
        node.addEventListener("touchend", clearPressTimer)
        node.addEventListener("touchcancel", clearPressTimer)
        node.addEventListener("pointerdown", onMousePointerDown)
    }

    function detach(): void {
        if (!attached) return
        attached = false
        clearPressTimer()
        removeSwallow()
        node.removeEventListener("touchstart", onTouchStart)
        node.removeEventListener("touchmove", clearPressTimer)
        node.removeEventListener("touchend", clearPressTimer)
        node.removeEventListener("touchcancel", clearPressTimer)
        node.removeEventListener("pointerdown", onMousePointerDown)
    }

    if (enabled) attach()

    return {
        update(o?: { enabled?: boolean }): void {
            let next = o?.enabled !== false
            if (next === enabled) return
            enabled = next
            if (enabled) attach()
            else detach()
        },
        destroy(): void {
            enabled = false
            detach()
        },
    }
}
