// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { bindMediaViewerKeys } from "./keyboard"

function handlers(overrides?: Partial<Parameters<typeof bindMediaViewerKeys>[0]>) {
    let allowSwitch = true
    let allowZoom = true
    return {
        close: vi.fn(),
        prev: vi.fn(),
        next: vi.fn(),
        zoomIn: vi.fn(),
        zoomOut: vi.fn(),
        resetZoom: vi.fn(),
        getAllowSwitch: () => allowSwitch,
        getAllowZoom: () => allowZoom,
        setAllowSwitch: (v: boolean) => {
            allowSwitch = v
        },
        setAllowZoom: (v: boolean) => {
            allowZoom = v
        },
        ...overrides,
    }
}

describe("bindMediaViewerKeys", () => {
    it("Escape closes; arrows nav when allowed; zoom keys only when allowZoom", () => {
        let close = vi.fn()
        let prev = vi.fn()
        let next = vi.fn()
        let zoomIn = vi.fn()
        let zoomOut = vi.fn()
        let resetZoom = vi.fn()
        let allowSwitch = true
        let allowZoom = true
        let stop = bindMediaViewerKeys({
            close,
            prev,
            next,
            zoomIn,
            zoomOut,
            resetZoom,
            getAllowSwitch: () => allowSwitch,
            getAllowZoom: () => allowZoom,
        })
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "=" }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "-" }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "0" }))
        expect(close).toHaveBeenCalledTimes(1)
        expect(prev).toHaveBeenCalledTimes(1)
        expect(next).toHaveBeenCalledTimes(1)
        expect(zoomIn).toHaveBeenCalledTimes(2)
        expect(zoomOut).toHaveBeenCalledTimes(1)
        expect(resetZoom).toHaveBeenCalledTimes(1)
        allowSwitch = false
        allowZoom = false
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }))
        expect(prev).toHaveBeenCalledTimes(1)
        expect(zoomIn).toHaveBeenCalledTimes(2)
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", metaKey: true }))
        stop()
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
        expect(close).toHaveBeenCalledTimes(1)
    })

    it("ctrl/meta blocks zoom and nav but Escape still closes", () => {
        let h = handlers()
        let stop = bindMediaViewerKeys(h)
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", metaKey: true }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "+", metaKey: true }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "-", ctrlKey: true }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "0", metaKey: true }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "=", ctrlKey: true }))
        expect(h.prev).not.toHaveBeenCalled()
        expect(h.next).not.toHaveBeenCalled()
        expect(h.zoomIn).not.toHaveBeenCalled()
        expect(h.zoomOut).not.toHaveBeenCalled()
        expect(h.resetZoom).not.toHaveBeenCalled()
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", metaKey: true }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", ctrlKey: true }))
        expect(h.close).toHaveBeenCalledTimes(2)
        stop()
    })

    it("preventDefault on handled nav/zoom keys; Escape does not", () => {
        let h = handlers()
        let stop = bindMediaViewerKeys(h)
        let escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
        let left = new KeyboardEvent("keydown", { key: "ArrowLeft", cancelable: true })
        let plus = new KeyboardEvent("keydown", { key: "+", cancelable: true })
        document.dispatchEvent(escape)
        document.dispatchEvent(left)
        document.dispatchEvent(plus)
        expect(escape.defaultPrevented).toBe(false)
        expect(left.defaultPrevented).toBe(true)
        expect(plus.defaultPrevented).toBe(true)
        h.setAllowSwitch(false)
        h.setAllowZoom(false)
        let blockedLeft = new KeyboardEvent("keydown", { key: "ArrowLeft", cancelable: true })
        let blockedPlus = new KeyboardEvent("keydown", { key: "+", cancelable: true })
        document.dispatchEvent(blockedLeft)
        document.dispatchEvent(blockedPlus)
        expect(blockedLeft.defaultPrevented).toBe(false)
        expect(blockedPlus.defaultPrevented).toBe(false)
        stop()
    })

    it("listens on a custom target and double unbind is safe", () => {
        let target = document.createElement("div")
        document.body.append(target)
        let h = handlers()
        let stop = bindMediaViewerKeys(h, target)
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
        expect(h.close).not.toHaveBeenCalled()
        target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        expect(h.close).toHaveBeenCalledTimes(1)
        stop()
        stop()
        target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        expect(h.close).toHaveBeenCalledTimes(1)
        target.remove()
    })

    it("allows repeat keydown while held", () => {
        let h = handlers()
        let stop = bindMediaViewerKeys(h)
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "=", repeat: true }))
        expect(h.next).toHaveBeenCalledTimes(2)
        expect(h.zoomIn).toHaveBeenCalledTimes(1)
        stop()
    })
})
