import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { createTxAls } from "./tx-als"

let here = dirname(fileURLToPath(import.meta.url))

describe("createTxAls", () => {
    it("does not statically import node:async_hooks or node:module", () => {
        let src = readFileSync(join(here, "tx-als.ts"), "utf8")
        expect(src).not.toMatch(/node:async_hooks/)
        expect(src).not.toMatch(/node:module/)
    })

    it("propagates store across await so nested enter sees it", async () => {
        let gate = createTxAls()
        await gate.enter(async (als) => {
            expect(als.getStore()).toBeUndefined()
            await als.run(async () => {
                expect(als.getStore()).toBe(true)
                await Promise.resolve()
                expect(als.getStore()).toBe(true)
                await gate.enter(async (inner) => {
                    expect(inner.getStore()).toBe(true)
                })
            })
            expect(als.getStore()).toBeUndefined()
        })
    })

    it("concurrent enter before run does not look nested", async () => {
        let gate = createTxAls()
        let seen: Array<true | undefined> = []
        await Promise.all([
            gate.enter(async (als) => {
                seen.push(als.getStore())
            }),
            gate.enter(async (als) => {
                seen.push(als.getStore())
            }),
        ])
        expect(seen).toEqual([undefined, undefined])
    })

    it("is not exported from the public Collection barrel", async () => {
        let mod = await import("./index")
        expect(mod).not.toHaveProperty("createTxAls")
    })
})
