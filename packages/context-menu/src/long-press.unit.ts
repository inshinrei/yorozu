// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MENU_LONG_PRESS_MS, MENU_LONG_PRESS_SWALLOW_MS, bindLongPress } from "./long-press"

function touchLike(clientX: number, clientY: number, target: EventTarget) {
    return {
        identifier: 0,
        target,
        clientX,
        clientY,
        pageX: clientX,
        pageY: clientY,
        screenX: clientX,
        screenY: clientY,
        radiusX: 0,
        radiusY: 0,
        rotationAngle: 0,
        force: 1,
    }
}

function dispatchTouch(node: HTMLElement, type: string, clientX: number, clientY: number) {
    let touch = touchLike(clientX, clientY, node)
    let active = type === "touchend" || type === "touchcancel" ? [] : [touch]
    node.dispatchEvent(
        new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: active as unknown as Touch[],
            targetTouches: active as unknown as Touch[],
            changedTouches: [touch] as unknown as Touch[],
        }),
    )
}

describe("bindLongPress", () => {
    let node: HTMLElement

    beforeEach(() => {
        vi.useFakeTimers()
        node = document.createElement("div")
        document.body.append(node)
    })

    afterEach(() => {
        node.remove()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it("fires contextmenu after 200ms at the touch point", () => {
        let onContextMenu = vi.fn()
        node.addEventListener("contextmenu", onContextMenu)
        bindLongPress(node)
        dispatchTouch(node, "touchstart", 40, 55)
        vi.advanceTimersByTime(MENU_LONG_PRESS_MS - 1)
        expect(onContextMenu).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(onContextMenu).toHaveBeenCalledTimes(1)
        let event = onContextMenu.mock.calls[0]![0] as MouseEvent
        expect(event.clientX).toBe(40)
        expect(event.clientY).toBe(55)
    })

    it("cancels when the touch moves", () => {
        let onContextMenu = vi.fn()
        node.addEventListener("contextmenu", onContextMenu)
        bindLongPress(node)
        dispatchTouch(node, "touchstart", 40, 55)
        dispatchTouch(node, "touchmove", 42, 56)
        vi.advanceTimersByTime(MENU_LONG_PRESS_MS)
        expect(onContextMenu).not.toHaveBeenCalled()
    })

    it("is a no-op when enabled is false", () => {
        let onContextMenu = vi.fn()
        node.addEventListener("contextmenu", onContextMenu)
        bindLongPress(node, { enabled: false })
        dispatchTouch(node, "touchstart", 40, 55)
        vi.advanceTimersByTime(MENU_LONG_PRESS_MS)
        expect(onContextMenu).not.toHaveBeenCalled()
    })

    it("swallows the following click, then drops swallow after 400ms", () => {
        bindLongPress(node)
        dispatchTouch(node, "touchstart", 40, 55)
        vi.advanceTimersByTime(MENU_LONG_PRESS_MS)

        let sawClick = vi.fn()
        document.body.addEventListener("click", sawClick)
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
        expect(sawClick).not.toHaveBeenCalled()

        vi.advanceTimersByTime(MENU_LONG_PRESS_SWALLOW_MS)
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
        expect(sawClick).toHaveBeenCalledTimes(1)
        document.body.removeEventListener("click", sawClick)
    })
})
