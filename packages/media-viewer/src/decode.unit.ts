// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import {
    DEFAULT_DECODE_BUDGET_ACTIVE,
    DEFAULT_DECODE_BUDGET_PEEK,
    DEFAULT_DECODE_BUDGET_THUMB,
    applyCanvasImageSource,
    createMediaDecodePort,
    type MediaDecodeRequest,
} from "./decode"

describe("createMediaDecodePort", () => {
    it("defaults budget 1 / 2 / 4", () => {
        expect(DEFAULT_DECODE_BUDGET_ACTIVE).toBe(1)
        expect(DEFAULT_DECODE_BUDGET_PEEK).toBe(2)
        expect(DEFAULT_DECODE_BUDGET_THUMB).toBe(4)
    })

    it("abort of another id does not cancel a running job", async () => {
        let port = createMediaDecodePort()
        let releaseA!: (v: CanvasImageSource | null) => void
        let a = port.request({
            id: "a",
            role: "active",
            src: "a.jpg",
            decode: ({ signal }) =>
                new Promise((resolve) => {
                    signal.addEventListener("abort", () => resolve(null))
                    releaseA = resolve
                }),
        })
        let b = port.request({
            id: "b",
            role: "peek-newer",
            src: "b.jpg",
            decode: async () => document.createElement("img"),
        })
        port.abort("b")
        expect(await b).toBeNull()
        let img = document.createElement("img")
        releaseA(img)
        expect(await a).toBe(img)
        port.destroy()
    })

    it("abort resolves null and ignores late fulfill", async () => {
        let port = createMediaDecodePort()
        let release!: (v: CanvasImageSource) => void
        let p = port.request({
            id: "a",
            role: "peek-newer",
            src: "a.jpg",
            decode: ({ signal }) =>
                new Promise((resolve) => {
                    signal.addEventListener("abort", () => resolve(null))
                    release = resolve
                }),
        })
        port.abort("a")
        expect(await p).toBeNull()
        release(document.createElement("img"))
        expect(port.inflight()).toEqual([])
        port.destroy()
    })

    it("peek budget 2 queues the third until a slot frees", async () => {
        let port = createMediaDecodePort({ budget: { peek: 2 } })
        let gates: Array<() => void> = []
        let decode = (req: MediaDecodeRequest) =>
            new Promise<CanvasImageSource | null>((resolve) => {
                gates.push(() => resolve(document.createElement("img")))
                void req
            })
        let a = port.request({ id: "a", role: "peek-older", src: "a.jpg", decode })
        let b = port.request({ id: "b", role: "peek-newer", src: "b.jpg", decode })
        let started = 0
        let decodeC = (req: MediaDecodeRequest) => {
            started += 1
            return decode(req)
        }
        let c = port.request({ id: "c", role: "peek-older", src: "c.jpg", decode: decodeC })
        expect(port.inflight()).toHaveLength(2)
        expect(started).toBe(0)
        gates[0]!()
        await a
        await Promise.resolve()
        expect(started).toBe(1)
        gates[1]!()
        gates[2]!()
        await b
        await c
        port.destroy()
    })

    it("pausePeeksAndThumbs blocks new peek/thumb starts; active still runs", async () => {
        let port = createMediaDecodePort()
        port.pausePeeksAndThumbs()
        expect(port.isPaused()).toBe(true)
        let peekStarted = 0
        let peek = port.request({
            id: "p",
            role: "peek-newer",
            src: "p.jpg",
            decode: async () => {
                peekStarted += 1
                return document.createElement("img")
            },
        })
        let active = await port.request({
            id: "a",
            role: "active",
            src: "a.jpg",
            decode: async () => document.createElement("img"),
        })
        expect(active).toBeInstanceOf(HTMLImageElement)
        expect(peekStarted).toBe(0)
        port.resume()
        expect(await peek).toBeInstanceOf(HTMLImageElement)
        expect(peekStarted).toBe(1)
        port.destroy()
    })

    it("re-request of the same id aborts the previous job", async () => {
        let port = createMediaDecodePort()
        let firstStarted = 0
        let first = port.request({
            id: "a",
            role: "peek-older",
            src: "a.jpg",
            decode: ({ signal }) =>
                new Promise((resolve) => {
                    firstStarted += 1
                    signal.addEventListener("abort", () => resolve(null))
                }),
        })
        expect(firstStarted).toBe(1)
        let img = document.createElement("img")
        let second = await port.request({
            id: "a",
            role: "active",
            src: "a2.jpg",
            decode: async () => img,
        })
        expect(await first).toBeNull()
        expect(second).toBe(img)
        expect(port.inflight()).toEqual([])
        port.destroy()
    })

    it("cross-bucket re-request pumps queued active without waiting for another finish", async () => {
        let port = createMediaDecodePort({ budget: { peek: 2, active: 1 } })
        let hang = (req: MediaDecodeRequest) =>
            new Promise<CanvasImageSource | null>((resolve) => {
                req.signal.addEventListener("abort", () => resolve(null))
            })
        let started: string[] = []
        let decode = (req: MediaDecodeRequest) => {
            started.push(`${req.role}:${req.id}`)
            return hang(req)
        }
        port.request({ id: "a", role: "peek-older", src: "a.jpg", decode })
        port.request({ id: "x", role: "active", src: "x.jpg", decode })
        port.request({ id: "b", role: "peek-newer", src: "b.jpg", decode })
        port.request({ id: "c", role: "peek-older", src: "c.jpg", decode })
        expect(started).toEqual(["peek-older:a", "active:x", "peek-newer:b"])
        let aActiveStarted = 0
        let aActive = port.request({
            id: "a",
            role: "active",
            src: "a.jpg",
            decode: (req) => {
                aActiveStarted += 1
                return decode(req)
            },
        })
        expect(aActiveStarted).toBe(0)
        port.request({ id: "x", role: "peek-newer", src: "x.jpg", decode })
        expect(aActiveStarted).toBe(1)
        expect(port.inflight().some((job) => job.id === "a" && job.role === "active")).toBe(true)
        port.destroy()
        expect(await aActive).toBeNull()
    })

    it("abort of a running id starts the next queued job of that bucket", async () => {
        let port = createMediaDecodePort({ budget: { peek: 1 } })
        let started: string[] = []
        let decode = (req: MediaDecodeRequest) => {
            started.push(req.id)
            return new Promise<CanvasImageSource | null>((resolve) => {
                req.signal.addEventListener("abort", () => resolve(null))
            })
        }
        let a = port.request({ id: "a", role: "peek-older", src: "a.jpg", decode })
        let bStarted = 0
        let b = port.request({
            id: "b",
            role: "peek-newer",
            src: "b.jpg",
            decode: (req) => {
                bStarted += 1
                return decode(req)
            },
        })
        expect(started).toEqual(["a"])
        expect(bStarted).toBe(0)
        port.abort("a")
        expect(await a).toBeNull()
        await Promise.resolve()
        expect(bStarted).toBe(1)
        expect(started).toEqual(["a", "b"])
        port.abort("b")
        expect(await b).toBeNull()
        port.destroy()
    })

    it("abortExcept keeps listed ids and abortRole drops one peek side", async () => {
        let port = createMediaDecodePort({ budget: { peek: 2, active: 1 } })
        let hang = (req: MediaDecodeRequest) =>
            new Promise<CanvasImageSource | null>((resolve) => {
                req.signal.addEventListener("abort", () => resolve(null))
            })
        let older = port.request({ id: "older", role: "peek-older", src: "o.jpg", decode: hang })
        let newer = port.request({ id: "newer", role: "peek-newer", src: "n.jpg", decode: hang })
        let active = port.request({ id: "active", role: "active", src: "a.jpg", decode: hang })
        expect(port.inflight()).toHaveLength(3)
        port.abortRole("peek-older")
        expect(await older).toBeNull()
        expect(
            port
                .inflight()
                .map((job) => job.id)
                .sort(),
        ).toEqual(["active", "newer"])
        port.abortExcept(["newer"])
        expect(await active).toBeNull()
        expect(port.inflight()).toEqual([{ id: "newer", role: "peek-newer" }])
        port.destroy()
        expect(await newer).toBeNull()
        expect(port.inflight()).toEqual([])
    })

    it("destroy resolves in-flight request null and ignores later request", async () => {
        let port = createMediaDecodePort()
        let p = port.request({
            id: "a",
            role: "active",
            src: "a.jpg",
            decode: ({ signal }) =>
                new Promise((resolve) => {
                    signal.addEventListener("abort", () => resolve(null))
                }),
        })
        port.destroy()
        expect(await p).toBeNull()
        let after = await port.request({
            id: "b",
            role: "active",
            src: "b.jpg",
            decode: async () => document.createElement("img"),
        })
        expect(after).toBeNull()
        expect(port.inflight()).toEqual([])
        expect(port.isPaused()).toBe(false)
    })
})

describe("applyCanvasImageSource", () => {
    it("appends an HTMLImageElement as a peek img", () => {
        let parent = document.createElement("div")
        let img = document.createElement("img")
        img.src = "blob:n"
        applyCanvasImageSource(parent, img, { peek: true, alt: "" })
        let out = parent.querySelector("[data-yorozu-media-peek]") as HTMLImageElement
        expect(out).toBe(img)
        expect(out.draggable).toBe(false)
    })

    it("draws a non-img source onto a canvas stage", () => {
        let parent = document.createElement("div")
        let source = document.createElement("canvas")
        source.width = 12
        source.height = 8
        applyCanvasImageSource(parent, source, { stage: true, alt: "stage" })
        let out = parent.querySelector("[data-yorozu-media-stage]") as HTMLCanvasElement
        expect(out).toBeInstanceOf(HTMLCanvasElement)
        expect(out).not.toBe(source)
        expect(out.width).toBe(12)
        expect(out.height).toBe(8)
        expect(parent.querySelector("img")).toBeNull()
    })
})
