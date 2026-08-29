import { describe, expect, it } from "vitest"
import { makeLog, reportFlowFailure } from "./make-log"
import { makeSilentLog } from "./silent"
import { createTestLog } from "./test-log"
import type { Logger } from "./types"

describe("makeLog", () => {
    it("attaches issueKey to every .error call", () => {
        let raw = createTestLog()
        let log = makeLog(raw, "yorozu-test")
        log.error(new Error("e"))
        let rec = raw.collect().find((r) => r.errorMeta)
        expect(rec?.errorMeta?.issueKey).toBe("yorozu-test")
    })

    it("nested flow.span failure still has issueKey", async () => {
        let raw = createTestLog()
        let log = makeLog(raw, "yorozu-test")
        await expect(
            log.flow("x").span("s", async () => {
                throw new Error("boom")
            }),
        ).rejects.toThrow("boom")
        let rec = raw.collect().find((r) => r.errorMeta)
        expect(rec?.errorMeta?.issueKey).toBe("yorozu-test")
        expect(rec?.errorMeta?.span).toBe("s")
    })

    it("throws if src has no .flow", () => {
        expect(() => makeLog({} as Logger, "yorozu-test")).toThrow(/requires.*\.flow/)
    })

    it("caller-supplied issueKey cannot override the bound key", () => {
        let raw = createTestLog()
        let log = makeLog(raw, "yorozu-test")
        log.error(new Error("e"), { issueKey: "attacker" })
        let rec = raw.collect().find((r) => r.errorMeta)
        expect(rec?.errorMeta?.issueKey).toBe("yorozu-test")
    })

    it("assert forwards with issueKey merged", () => {
        let raw = createTestLog()
        let log = makeLog(raw, "yorozu-test")
        log.assert(false, new Error("bad"), { op: "check" })
        let rec = raw.collect().find((r) => r.errorMeta)
        expect(rec?.errorMeta?.issueKey).toBe("yorozu-test")
        expect(rec?.errorMeta?.op).toBe("check")
    })

    it("span still runs when wrapping makeSilentLog", async () => {
        let log = makeLog(makeSilentLog(), "k")
        expect(await log.span("x", async () => 1)).toBe(1)
    })
})

describe("reportFlowFailure", () => {
    it("logs Error as .error", () => {
        let log = createTestLog()
        reportFlowFailure(log, new Error("e"))
        expect(log.collect().some((r) => r.level === "ERROR")).toBe(true)
    })

    it('warns never-happen for "{}" string and does not .error', () => {
        let log = createTestLog()
        reportFlowFailure(log, "{}")
        let recs = log.collect()
        expect(recs.some((r) => r.level === "ERROR")).toBe(false)
        expect(recs.some((r) => r.args?.[0] === "never-happen")).toBe(true)
    })
})
