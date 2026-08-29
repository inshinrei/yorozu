import { describe, expect, it } from "vitest"
import { createTestLog, expectFlowStory } from "./test-log"

describe("createTestLog", () => {
    it("captures a flow story with start then done", () => {
        let log = createTestLog()
        let flow = log.flow("checkout", { requestId: "r1" })
        flow.info("start", { orderId: 1 })
        flow.info("done", { orderId: 1 })
        expectFlowStory(log.collect(), "checkout", ["start", "done"])
    })

    it("expectFlowStory fails on extra skip", () => {
        let log = createTestLog()
        let flow = log.flow("checkout")
        flow.info("start", {})
        flow.warn("skip", { reason: "x" })
        flow.info("done", {})
        expect(() => expectFlowStory(log.collect(), "checkout", ["start", "done"])).toThrow(
            /expected start→done, got start→skip→done/,
        )
    })

    it("span start/done on a flow child are not part of the flow story", async () => {
        let log = createTestLog()
        let flow = log.flow("checkout")
        flow.info("start", {})
        await flow.span("charge", async () => 1)
        flow.info("done", {})
        expectFlowStory(log.collect(), "checkout", ["start", "done"])
        expect(log.collect().some((r) => (r.args ?? []).includes("span"))).toBe(true)
    })

    it("flow.error is a story event", () => {
        let log = createTestLog()
        let flow = log.flow("checkout")
        flow.info("start", {})
        flow.error(new Error("boom"), { orderId: 1 })
        expectFlowStory(log.collect(), "checkout", ["start", "error"])
    })
})
