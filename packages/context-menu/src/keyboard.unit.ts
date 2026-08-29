// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MENU_FOCUSABLE_SELECTOR, moveMenuFocus } from "./keyboard"

describe("moveMenuFocus", () => {
    let root: HTMLElement
    let first: HTMLElement
    let disabled: HTMLElement
    let last: HTMLElement
    let scrollIntoView: ReturnType<typeof vi.fn>

    beforeEach(() => {
        scrollIntoView = vi.fn()
        HTMLElement.prototype.scrollIntoView = scrollIntoView

        root = document.createElement("div")
        first = document.createElement("div")
        first.setAttribute("role", "menuitem")
        first.tabIndex = 0
        disabled = document.createElement("div")
        disabled.setAttribute("role", "menuitem")
        disabled.className = "disabled"
        disabled.tabIndex = 0
        last = document.createElement("div")
        last.setAttribute("role", "menuitem")
        last.tabIndex = 0
        root.append(first, disabled, last)
        document.body.append(root)
    })

    afterEach(() => {
        root.remove()
        vi.restoreAllMocks()
    })

    it("exposes the focusable selector verbatim", () => {
        expect(MENU_FOCUSABLE_SELECTOR).toBe(
            '[role="menuitem"]:not(.disabled), [role="menuitemcheckbox"]:not(.disabled)',
        )
    })

    it("moves +1 to the first enabled item, then the last; -1 returns to the first", () => {
        moveMenuFocus(root, 1)
        expect(document.activeElement).toBe(first)
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" })

        moveMenuFocus(root, 1)
        expect(document.activeElement).toBe(last)

        moveMenuFocus(root, -1)
        expect(document.activeElement).toBe(first)
    })
})
