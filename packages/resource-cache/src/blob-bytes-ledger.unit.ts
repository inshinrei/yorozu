import { describe, expect, it } from "vitest"
import { BlobBytesLedger } from "./blob-bytes-ledger"

describe("BlobBytesLedger", () => {
    it("rebuilds from the list when cold and then uses the cache", async () => {
        let ledger = new BlobBytesLedger()
        let calls = 0
        let list = async () => {
            calls++
            return [
                { key: "a", bytes: 10 },
                { key: "b", bytes: 5 },
            ]
        }
        expect(await ledger.getTotal(list)).toBe(15)
        expect(await ledger.getTotal(list)).toBe(15)
        expect(calls).toBe(1)
    })

    it("overwrite while hot replaces bytes instead of adding with prev=0", async () => {
        let ledger = new BlobBytesLedger()
        expect(await ledger.getTotal(async () => [])).toBe(0)
        ledger.note("a", 10)
        expect(await ledger.getTotal(async () => [])).toBe(10)
        ledger.note("a", 3)
        expect(await ledger.getTotal(async () => [])).toBe(3)
        ledger.note("a", 0)
        expect(await ledger.getTotal(async () => [])).toBe(0)
    })

    it("forget while hot subtracts that key's size", async () => {
        let ledger = new BlobBytesLedger()
        expect(
            await ledger.getTotal(async () => [
                { key: "keep", bytes: 2 },
                { key: "drop", bytes: 4 },
            ]),
        ).toBe(6)
        ledger.forget("drop")
        expect(await ledger.getTotal(async () => [])).toBe(2)
    })

    it("retries rebuild when note happens during list and does not assign the stale snapshot", async () => {
        let ledger = new BlobBytesLedger()
        let n = 0
        let list = async () => {
            n++
            if (n === 1) {
                ledger.note("b", 5)
                return [{ key: "a", bytes: 10 }]
            }
            return [
                { key: "a", bytes: 10 },
                { key: "b", bytes: 5 },
            ]
        }
        expect(await ledger.getTotal(list)).toBe(15)
        expect(n).toBe(2)
        expect(
            await ledger.getTotal(async () => {
                throw new Error("must not list while hot")
            }),
        ).toBe(15)
    })

    it("retries rebuild when forget happens during list", async () => {
        let ledger = new BlobBytesLedger()
        let n = 0
        let list = async () => {
            n++
            if (n === 1) {
                ledger.forget("b")
                return [
                    { key: "a", bytes: 10 },
                    { key: "b", bytes: 5 },
                ]
            }
            return [{ key: "a", bytes: 10 }]
        }
        expect(await ledger.getTotal(list)).toBe(10)
        expect(n).toBe(2)
    })

    it("retries rebuild when invalidate happens during list", async () => {
        let ledger = new BlobBytesLedger()
        let n = 0
        let list = async () => {
            n++
            if (n === 1) {
                ledger.invalidate()
                return [{ key: "stale", bytes: 99 }]
            }
            return []
        }
        expect(await ledger.getTotal(list)).toBe(0)
        expect(n).toBe(2)
    })
})
