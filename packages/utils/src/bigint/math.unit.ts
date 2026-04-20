import { describe, expect, it } from "vitest"
import { abs, bitLength, euclideanGcd, max, max2, min, min2, modInv, modPowBinary, twoMultiplicity } from "./math"

describe("BigInt utilities", () => {
    describe("bitLength", () => {
        it("returns correct bit length", () => {
            expect(bitLength(0n)).toBe(0)
            expect(bitLength(1n)).toBe(1)
            expect(bitLength(2n)).toBe(2)
            expect(bitLength(3n)).toBe(2)
            expect(bitLength(4n)).toBe(3)
            expect(bitLength(7n)).toBe(3)
            expect(bitLength(8n)).toBe(4)
            expect(bitLength(-1n)).toBe(1)
            expect(bitLength(0xffn)).toBe(8)
            expect(bitLength(0x100n)).toBe(9)
        })
    })

    describe("twoMultiplicity", () => {
        it("returns the highest power of 2 dividing the number", () => {
            expect(twoMultiplicity(0n)).toBe(0n)
            expect(twoMultiplicity(1n)).toBe(0n)
            expect(twoMultiplicity(2n)).toBe(1n)
            expect(twoMultiplicity(4n)).toBe(2n)
            expect(twoMultiplicity(8n)).toBe(3n)
            expect(twoMultiplicity(12n)).toBe(2n)
            expect(twoMultiplicity(16n)).toBe(4n)
            expect(twoMultiplicity(17n)).toBe(0n)
            expect(twoMultiplicity(-8n)).toBe(3n)
        })
    })

    describe("min / min2", () => {
        it("min2 returns the smaller of two values", () => {
            expect(min2(5n, 3n)).toBe(3n)
            expect(min2(3n, 5n)).toBe(3n)
            expect(min2(-5n, 3n)).toBe(-5n)
            expect(min2(0n, 0n)).toBe(0n)
        })

        it("min returns the smallest value from many arguments", () => {
            expect(min(5n, 3n, 8n, -1n, 0n)).toBe(-1n)
            expect(min(10n, 20n)).toBe(10n)
            expect(min(0n)).toBe(0n)
        })
    })

    describe("max / max2", () => {
        it("max2 returns the larger of two values", () => {
            expect(max2(5n, 3n)).toBe(5n)
            expect(max2(-5n, 3n)).toBe(3n)
            expect(max2(0n, 0n)).toBe(0n)
        })

        it("max returns the largest value from many arguments", () => {
            expect(max(5n, 3n, 8n, -1n, 0n)).toBe(8n)
            expect(max(10n, 20n)).toBe(20n)
            expect(max(0n)).toBe(0n)
        })
    })

    describe("abs", () => {
        it("returns absolute value", () => {
            expect(abs(5n)).toBe(5n)
            expect(abs(-5n)).toBe(5n)
            expect(abs(0n)).toBe(0n)
        })
    })

    describe("euclideanGcd", () => {
        it("computes GCD correctly", () => {
            expect(euclideanGcd(48n, 18n)).toBe(6n)
            expect(euclideanGcd(17n, 13n)).toBe(1n)
            expect(euclideanGcd(100n, 25n)).toBe(25n)
            expect(euclideanGcd(0n, 42n)).toBe(42n)
            expect(euclideanGcd(42n, 0n)).toBe(42n)
            expect(euclideanGcd(0n, 0n)).toBe(0n)
        })
    })

    describe("modPowBinary", () => {
        it("computes modular exponentiation correctly", () => {
            expect(modPowBinary(2n, 10n, 1000n)).toBe(24n)
            expect(modPowBinary(5n, 3n, 7n)).toBe(6n)
            expect(modPowBinary(3n, 0n, 5n)).toBe(1n)
        })
    })

    describe("modInv", () => {
        it("computes modular inverse when it exists", () => {
            expect(modInv(3n, 7n)).toBe(5n)
            expect(modInv(5n, 17n)).toBe(7n)
        })

        it("throws when no inverse exists", () => {
            expect(() => modInv(4n, 6n)).toThrow(RangeError)
            expect(() => modInv(2n, 4n)).toThrow(RangeError)
        })
    })

    describe("edge cases and large numbers", () => {
        it("handles very large BigInts correctly", () => {
            const big = 12345678901234567890n
            expect(bitLength(big)).toBe(64)
            expect(euclideanGcd(big, 123n)).toBe(3n)
        })

        it("min/max work with many arguments and negatives", () => {
            expect(min(10n, -5n, 0n, 100n, -100n)).toBe(-100n)
            expect(max(10n, -5n, 0n, 100n, -100n)).toBe(100n)
        })
    })
})
