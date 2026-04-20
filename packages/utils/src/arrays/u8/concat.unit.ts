import { beforeEach, describe, expect, it, vi } from "vitest"
import { concat, concat2, concat3 } from "./concat"
import { allocate } from "./pool"

vi.mock("./pool", () => ({
    allocate: vi.fn((size: number) => new Uint8Array(size)),
}))

const mockAllocate = vi.mocked(allocate)

describe("concat", () => {
    beforeEach(() => {
        mockAllocate.mockClear()
    })

    it("returns the original buffer unchanged when only one item is passed (zero-copy)", () => {
        let single = new Uint8Array([1, 2, 3])
        let result = concat([single])

        expect(result).toBe(single)
        expect(mockAllocate).not.toHaveBeenCalled()
    })

    it("uses Buffer.concat when running in Node.js environment", () => {
        const originalBuffer = globalThis.Buffer
        const mockBufferConcat = vi.fn((bufs: Uint8Array[]) => ({
            buffer: new ArrayBuffer(10),
            byteOffset: 0,
            byteLength: 10,
        }))
        globalThis.Buffer = { concat: mockBufferConcat } as any

        let a = new Uint8Array([1, 2])
        let b = new Uint8Array([3, 4])
        let result = concat([a, b])

        expect(mockBufferConcat).toHaveBeenCalledWith([a, b])
        expect(result).toBeInstanceOf(Uint8Array)

        globalThis.Buffer = originalBuffer
    })

    it("falls back to allocate + set when Buffer is not available (browser path)", () => {
        const originalBuffer = globalThis.Buffer
        globalThis.Buffer = undefined as any

        let a = new Uint8Array([10, 20])
        let b = new Uint8Array([30, 40, 50])

        let result = concat([a, b])

        expect(mockAllocate).toHaveBeenCalledWith(5)
        expect(result).toEqual(new Uint8Array([10, 20, 30, 40, 50]))
        expect(result.buffer).not.toBe(a.buffer)

        globalThis.Buffer = originalBuffer
    })

    it("handles empty array of buffers", () => {
        let result = concat([])
        expect(mockAllocate).toHaveBeenCalledWith(0)
        expect(result).toEqual(new Uint8Array([]))
    })

    it("handles array containing empty buffers", () => {
        let result = concat([new Uint8Array([]), new Uint8Array([1, 2]), new Uint8Array([])])
        expect(result).toEqual(new Uint8Array([1, 2]))
    })

    it("mutates subarray views correctly in fallback path", () => {
        let base = new Uint8Array([1, 2, 3, 4, 5])
        let sub1 = base.subarray(0, 2)
        let sub2 = base.subarray(3, 5)

        let result = concat([sub1, sub2])
        expect(result).toEqual(new Uint8Array([1, 2, 4, 5]))
    })
})

describe("concat2", () => {
    beforeEach(() => {
        mockAllocate.mockClear()
    })

    it("allocates once and concatenates two ArrayLike inputs", () => {
        let a = [1, 2, 3]
        let b = new Uint8Array([4, 5])

        let result = concat2(a, b)

        expect(mockAllocate).toHaveBeenCalledTimes(1)
        expect(mockAllocate).toHaveBeenCalledWith(5)
        expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
    })

    it("handles empty inputs", () => {
        let result = concat2([], [])
        expect(mockAllocate).toHaveBeenCalledWith(0)
        expect(result).toEqual(new Uint8Array([]))
    })
})

describe("concat3", () => {
    beforeEach(() => {
        mockAllocate.mockClear()
    })

    it("allocates once and concatenates three ArrayLike inputs", () => {
        let a = new Uint8Array([10])
        let b = [20, 30]
        let c = new Uint8Array([40, 50, 60])

        let result = concat3(a, b, c)

        expect(mockAllocate).toHaveBeenCalledWith(6)
        expect(result).toEqual(new Uint8Array([10, 20, 30, 40, 50, 60]))
    })

    it("handles mixed empty and non-empty inputs", () => {
        let result = concat3([], [1], [])
        expect(result).toEqual(new Uint8Array([1]))
    })
})
