// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import {
    __resetConfirmAnchorForTests,
    bindConfirmPointer,
    lastConfirmAnchor,
    resolveConfirmAnchor,
    setLastConfirmAnchor,
} from "./anchor"

describe("confirm-tooltip-anchor", () => {
    afterEach(() => {
        __resetConfirmAnchorForTests()
    })

    it("starts at 0,0 and last wins after set", () => {
        expect(lastConfirmAnchor()).toEqual({ x: 0, y: 0 })
        setLastConfirmAnchor({ x: 12, y: 34 })
        expect(lastConfirmAnchor()).toEqual({ x: 12, y: 34 })
        expect(lastConfirmAnchor()).not.toBe(lastConfirmAnchor())
    })

    it("bindConfirmPointer records capture-phase pointerdown", () => {
        let unbind = bindConfirmPointer(document)
        document.dispatchEvent(new PointerEvent("pointerdown", { clientX: 80, clientY: 90, bubbles: true }))
        expect(lastConfirmAnchor()).toEqual({ x: 80, y: 90 })
        unbind()
        document.dispatchEvent(new PointerEvent("pointerdown", { clientX: 1, clientY: 1, bubbles: true }))
        expect(lastConfirmAnchor()).toEqual({ x: 80, y: 90 })
    })

    it("capture records even when the target stops bubble", () => {
        let bubbleRan = false
        let child = document.createElement("div")
        document.body.appendChild(child)
        child.addEventListener("pointerdown", (e) => e.stopPropagation())
        document.addEventListener("pointerdown", () => {
            bubbleRan = true
        })
        let unbind = bindConfirmPointer(document)
        child.dispatchEvent(new PointerEvent("pointerdown", { clientX: 8, clientY: 9, bubbles: true }))
        expect(lastConfirmAnchor()).toEqual({ x: 8, y: 9 })
        expect(bubbleRan).toBe(false)
        unbind()
        child.remove()
    })

    it("resolveConfirmAnchor prefers MouseEvent, then rect center, then last", () => {
        setLastConfirmAnchor({ x: 5, y: 6 })
        let mouse = new MouseEvent("click", { clientX: 11, clientY: 22 })
        expect(resolveConfirmAnchor(mouse)).toEqual({ x: 11, y: 22 })
        expect(resolveConfirmAnchor({ x: 3, y: 4 })).toEqual({ x: 3, y: 4 })
        expect(resolveConfirmAnchor()).toEqual({ x: 5, y: 6 })
        expect(resolveConfirmAnchor(null)).toEqual({ x: 5, y: 6 })

        let node = document.createElement("div")
        node.getBoundingClientRect = () =>
            ({
                left: 10,
                top: 20,
                width: 40,
                height: 20,
                right: 50,
                bottom: 40,
                x: 10,
                y: 20,
                toJSON() {
                    return {}
                },
            }) as DOMRect
        let ev = new Event("keydown")
        Object.defineProperty(ev, "currentTarget", { value: node })
        expect(resolveConfirmAnchor(ev)).toEqual({ x: 30, y: 30 })
    })
})
