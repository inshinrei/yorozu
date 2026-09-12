// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { createSharedElement } from "./player"

describe("createSharedElement bitmap clone", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        Reflect.deleteProperty(HTMLElement.prototype, "animate")
        document.body.replaceChildren()
    })

    it("uses image and cloneCount is 1 then 0; second play does not stack clones", async () => {
        vi.stubGlobal(
            "requestAnimationFrame",
            (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number,
        )
        HTMLElement.prototype.animate = vi.fn(() => ({
            finished: Promise.resolve(),
            cancel: vi.fn(),
        })) as unknown as typeof HTMLElement.prototype.animate
        let host = document.createElement("div")
        document.body.append(host)
        let se = createSharedElement()
        let bitmap = document.createElement("img")
        bitmap.src = "blob:bit"
        se.play({
            host,
            from: { top: 0, left: 0, width: 10, height: 10 },
            to: { top: 20, left: 20, width: 40, height: 40 },
            image: bitmap,
            imageUrl: "https://example/should-not-use.jpg",
        })
        expect(se.cloneCount()).toBe(1)
        expect(host.querySelectorAll("img")).toHaveLength(1)
        expect((host.querySelector("img") as HTMLImageElement).src).toContain("blob:bit")
        expect((host.querySelector("img") as HTMLImageElement).src).not.toContain("should-not-use")
        se.play({
            host,
            from: { top: 0, left: 0, width: 10, height: 10 },
            to: { top: 20, left: 20, width: 40, height: 40 },
            imageUrl: "https://example/b.jpg",
        })
        expect(se.cloneCount()).toBe(1)
        expect(host.childElementCount).toBe(1)
        se.cancel()
        expect(se.cloneCount()).toBe(0)
        host.remove()
        vi.unstubAllGlobals()
        Reflect.deleteProperty(HTMLElement.prototype, "animate")
    })

    it("draws a non-img image onto a canvas child", () => {
        vi.stubGlobal(
            "requestAnimationFrame",
            (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number,
        )
        HTMLElement.prototype.animate = vi.fn(() => ({
            finished: Promise.resolve(),
            cancel: vi.fn(),
        })) as unknown as typeof HTMLElement.prototype.animate
        let host = document.createElement("div")
        document.body.append(host)
        let se = createSharedElement()
        let bitmap = document.createElement("canvas")
        bitmap.width = 8
        bitmap.height = 4
        se.play({
            host,
            from: { top: 0, left: 0, width: 10, height: 10 },
            to: { top: 20, left: 20, width: 40, height: 40 },
            image: bitmap,
            imageUrl: "https://example/should-not-use.jpg",
        })
        expect(se.cloneCount()).toBe(1)
        expect(host.querySelector("canvas")).toBeInstanceOf(HTMLCanvasElement)
        expect(host.querySelector("img")).toBeNull()
        se.cancel()
        host.remove()
        vi.unstubAllGlobals()
        Reflect.deleteProperty(HTMLElement.prototype, "animate")
    })
})
