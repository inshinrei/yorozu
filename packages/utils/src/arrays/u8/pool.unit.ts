import { beforeEach, describe, expect, it } from "vitest"
import { allocate, allocateWith, BufferPool, setDefaultPool } from "./pool"
import { empty } from "./misc"

describe("BufferPool", () => {
    let pool: BufferPool

    beforeEach(() => {
        pool = new BufferPool(512)
        pool.reset()
    })

    it("returns shared empty singleton for size === 0", () => {
        expect(pool.allocate(0)).toBe(empty)
        expect(pool.allocate(0)).toBe(empty)
    })

    it("allocates small buffers from pooled ArrayBuffer (zero-copy)", () => {
        let a = pool.allocate(16)
        let b = pool.allocate(32)

        expect(a.buffer).toBe(b.buffer)
        expect(a.byteOffset).toBe(0)
        expect(b.byteOffset).toBe(16)
        expect(a.length).toBe(16)
        expect(b.length).toBe(32)
    })

    it("creates fresh Uint8Array for allocations > maxAllocSize", () => {
        let large = pool.allocate(300)
        expect(large.length).toBe(300)
    })

    it("aligns every small allocation to 8-byte boundary", () => {
        pool.allocate(3)
        let aligned = pool.allocate(5)
        expect(aligned.byteOffset).toBe(8)
        expect(aligned.byteOffset % 8).toBe(0)

        let next = pool.allocate(10)
        expect(next.byteOffset).toBe(16)
    })
})

describe("global allocate / allocateWith / setDefaultPool", () => {
    beforeEach(() => {
        setDefaultPool(1024)
    })

    it("allocate delegates to current default pool", () => {
        let buf = allocate(64)
        expect(buf.length).toBe(64)
    })

    it("allocateWith allocates then copies data", () => {
        let init = [0x12, 0x34, 0x56, 0x78]
        let buf = allocateWith(init)
        expect(buf.length).toBe(4)
        expect(Array.from(buf)).toEqual(init)
    })

    it("allocate(0) always returns empty singleton", () => {
        expect(allocate(0)).toBe(empty)
    })

    it("setDefaultPool updates global pool size", () => {
        setDefaultPool(256)
        let large = allocate(300)
        expect(large.length).toBe(300)
    })
})
