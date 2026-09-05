import { beforeEach, describe, expect, it } from "vitest"
import { Bytes } from "./bytes"

describe("Bytes", () => {
    let b: Bytes

    beforeEach(() => {
        b = Bytes.allocate(32)
    })

    it("static allocate and capacity", () => {
        expect(b.capacity).toBe(32)
        expect(Bytes.allocate(8).capacity).toBe(8)
    })

    it("static from sets written", () => {
        let data = new Uint8Array([1, 2, 3, 4])
        let from = Bytes.from(data)
        expect(from.written).toBe(4)
        expect(from.result()).toEqual(data)
    })

    it("available and written start at zero", () => {
        expect(b.available).toBe(0)
        expect(b.written).toBe(0)
    })

    it("readSync single byte optimisation", () => {
        b.writeSync(3).set([10, 20, 30])
        let one = b.readSync(1)
        expect(one).toEqual(new Uint8Array([10]))
        expect(b.readSync(1)).toEqual(new Uint8Array([20]))
        expect(b.available).toBe(1)
    })

    it("readSync multi-byte returns subarray", () => {
        b.writeSync(5).set([1, 2, 3, 4, 5])
        let slice = b.readSync(3)
        expect(slice).toEqual(new Uint8Array([1, 2, 3]))
        expect(b.available).toBe(2)
        expect(b.readSync(10)).toEqual(new Uint8Array([4, 5]))
    })

    it("readSync on empty returns u8.empty", () => {
        expect(b.readSync(10)).toEqual(new Uint8Array(0))
    })

    it("async read fills into", async () => {
        b.writeSync(4).set([9, 8, 7, 6])
        let into = new Uint8Array(10)
        let n = await b.read(into)
        expect(n).toBe(4)
        expect(into.subarray(0, 4)).toEqual(new Uint8Array([9, 8, 7, 6]))
        expect(b.available).toBe(0)
    })

    it("writeSync grows with nextPowerOfTwo", () => {
        let oldCap = b.capacity
        b.writeSync(40)
        expect(b.capacity).toBeGreaterThan(oldCap)
        expect(b.capacity).toBe(64)
    })

    it("disposeWriteSync partial write shrinks writePos", () => {
        let slice = b.writeSync(10)
        slice.set([1, 2, 3, 4, 5])
        b.disposeWriteSync(5)
        expect(b.written).toBe(5)
        expect(b.result()).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
    })

    it("disposeWriteSync throws when written exceeds lastWriteSize", () => {
        b.writeSync(3)
        expect(() => b.disposeWriteSync(5)).toThrow(RangeError)
    })

    it("async write convenience", async () => {
        let data = new Uint8Array([10, 20, 30])
        await b.write(data)
        expect(b.result()).toEqual(data)
    })

    it("result returns live view of unread data", () => {
        b.writeSync(6).set([1, 2, 3, 4, 5, 6])
        b.readSync(2)
        expect(b.result()).toEqual(new Uint8Array([3, 4, 5, 6]))
    })

    it("reclaim copies to smaller buffer when beneficial", () => {
        b = Bytes.allocate(64)
        b.writeSync(20).set(new Uint8Array(20).fill(7))
        b.readSync(15)
        b.reclaim()
        expect(b.capacity).toBe(64)
        expect(b.result()).toEqual(new Uint8Array(5).fill(7))
    })

    it("reclaim uses copyWithin when no shrink needed", () => {
        b.writeSync(20).set(new Uint8Array(20).fill(9))
        b.readSync(10)
        b.reclaim()
        expect(b.available).toBe(10)
    })

    it("rewind moves readPos back", () => {
        b.writeSync(5).set([1, 2, 3, 4, 5])
        b.readSync(3)
        b.rewind(2)
        expect(b.available).toBe(4)
        expect(b.readSync(4)).toEqual(new Uint8Array([2, 3, 4, 5]))
    })

    it("rewind throws when n > readPos", () => {
        b.writeSync(3).set([1, 2, 3])
        expect(() => b.rewind(5)).toThrow(RangeError)
    })

    it("reset clears read and write positions", () => {
        b.writeSync(10).set(new Uint8Array(10).fill(99))
        b.readSync(4)
        b.reset()
        expect(b.available).toBe(0)
        expect(b.written).toBe(0)
    })

    it("full lifecycle round-trip", async () => {
        let data = new Uint8Array([1, 2, 3, 4, 5])
        await b.write(data)
        let read1 = await b.read(new Uint8Array(2))
        expect(read1).toBe(2)

        b.reclaim()
        let read2 = b.readSync(3)
        expect(read2).toEqual(new Uint8Array([3, 4, 5]))
    })
})
