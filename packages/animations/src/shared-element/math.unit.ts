import { describe, expect, it } from "vitest"
import {
    computeCloseFlight,
    computeFlight,
    computeOpenFlight,
    isRectFullyVisibleIn,
    isRectInViewport,
    offViewportLandingRect,
    resolveNaturalSize,
    uncoverByAspect,
} from "./math"

describe("uncoverByAspect", () => {
    it("expands a square crop to max side for square media", () => {
        let out = uncoverByAspect(100, 100, { top: 10, left: 10, width: 40, height: 20 })
        expect(out).toEqual({ top: 0, left: 10, width: 40, height: 40 })
    })

    it("expands width for landscape media in a portrait cell", () => {
        let out = uncoverByAspect(200, 100, { top: 0, left: 0, width: 50, height: 50 })
        expect(out).toEqual({ top: 0, left: -25, width: 100, height: 50 })
    })

    it("matches destination box aspect", () => {
        let out = uncoverByAspect(400, 200, { top: 0, left: 0, width: 50, height: 50 })
        expect(out).toEqual({ top: 0, left: -25, width: 100, height: 50 })
    })
})

describe("computeFlight", () => {
    it("maps center delta and scale from from→to", () => {
        let flight = computeFlight(
            { top: 0, left: 0, width: 100, height: 50 },
            { top: 100, left: 200, width: 200, height: 100 },
        )
        expect(flight).not.toBeNull()
        expect(flight!.fromTranslateX).toBe(50 - 300)
        expect(flight!.fromTranslateY).toBe(25 - 150)
        expect(flight!.fromScaleX).toBe(0.5)
        expect(flight!.fromScaleY).toBe(0.5)
    })
})

describe("computeOpenFlight", () => {
    it("open cover flight uses destination aspect so scale is uniform", () => {
        let flight = computeOpenFlight({
            thumb: { top: 0, left: 0, width: 50, height: 50 },
            objectFit: "cover",
            viewport: { width: 400, height: 300 },
            insets: { top: 0, right: 0, bottom: 0, left: 0 },
            to: { top: 50, left: 50, width: 200, height: 100 },
        })
        expect(flight).not.toBeNull()
        expect(flight!.fromScaleX).toBeCloseTo(flight!.fromScaleY)
    })

    it("uses explicit live to when provided", () => {
        let to = { top: 40, left: 100, width: 400, height: 200 }
        let flight = computeOpenFlight({
            thumb: { top: 200, left: 50, width: 80, height: 40 },
            naturalWidth: 800,
            naturalHeight: 400,
            objectFit: "contain",
            viewport: { width: 1000, height: 800 },
            to,
        })
        expect(flight).not.toBeNull()
        expect(flight!.to).toEqual(to)
    })

    it("computes to from natural + insets when to is omitted", () => {
        let flight = computeOpenFlight({
            thumb: { top: 100, left: 100, width: 80, height: 40 },
            naturalWidth: 800,
            naturalHeight: 400,
            objectFit: "contain",
            viewport: { width: 1000, height: 800 },
            insets: { top: 50, right: 10, bottom: 50, left: 10 },
        })
        expect(flight).not.toBeNull()
        expect(flight!.to.width).toBeGreaterThan(0)
        expect(flight!.fromScaleX).toBeLessThan(1)
    })
})

describe("computeCloseFlight", () => {
    it("close cover flight uses min scale so the land crop matches", () => {
        let flight = computeCloseFlight({
            fromStage: { top: 0, left: 0, width: 200, height: 100 },
            thumb: { top: 10, left: 10, width: 40, height: 40 },
            objectFit: "cover",
        })
        expect(flight).not.toBeNull()
        expect(flight!.fromScaleX).toBe(flight!.fromScaleY)
    })
})

describe("resolveNaturalSize", () => {
    it("prefers explicit natural", () => {
        expect(resolveNaturalSize(10, 20, { top: 0, left: 0, width: 1, height: 1 })).toEqual({
            width: 10,
            height: 20,
        })
    })

    it("falls back to thumb", () => {
        expect(resolveNaturalSize(undefined, undefined, { top: 0, left: 0, width: 3, height: 4 })).toEqual({
            width: 3,
            height: 4,
        })
    })
})

describe("isRectFullyVisibleIn", () => {
    it("isRectFullyVisibleIn is exclusive of overflow by epsilon", () => {
        expect(
            isRectFullyVisibleIn(
                { top: 10, left: 10, width: 20, height: 20 },
                { top: 0, left: 0, width: 100, height: 100 },
            ),
        ).toBe(true)
        expect(
            isRectFullyVisibleIn(
                { top: -2, left: 10, width: 20, height: 20 },
                { top: 0, left: 0, width: 100, height: 100 },
            ),
        ).toBe(false)
    })
})

describe("isRectInViewport", () => {
    it("detects viewport intersection", () => {
        expect(isRectInViewport({ top: 10, left: 10, width: 40, height: 40 }, { width: 100, height: 100 })).toBe(
            true,
        )
        expect(isRectInViewport({ top: -100, left: 10, width: 40, height: 40 }, { width: 100, height: 100 })).toBe(
            false,
        )
    })
})

describe("offViewportLandingRect", () => {
    it("places off-viewport landing above or below", () => {
        let above = offViewportLandingRect(
            { top: 200, left: 0, width: 100, height: 100 },
            { top: 10, left: 20, width: 50, height: 40 },
            800,
        )
        expect(above.top).toBe(-40)
        expect(above.left).toBe(20)

        let below = offViewportLandingRect(
            { top: 10, left: 0, width: 100, height: 100 },
            { top: 500, left: 20, width: 50, height: 40 },
            400,
        )
        expect(below.top).toBe(400)
    })
})
