import { describe, it, expect } from 'vitest'
import { unknownToError } from './error'

describe('unknownToError', () => {
    it('returns Error instance unchanged', () => {
        let original = new Error('boom', { cause: 'root' })
        let result = unknownToError(original)
        expect(result).toBe(original)
        expect(result.message).toBe('boom')
    })

    it('converts string to Error', () => {
        let result = unknownToError('network failed')
        expect(result).toBeInstanceOf(Error)
        expect(result.message).toBe('network failed')
        expect(result.cause).toBeUndefined()
    })

    it('stringifies primitives with cause preserved', () => {
        let primitives = [42, true, null, undefined, BigInt(9001), Symbol('test')]

        for (let p of primitives) {
            let result = unknownToError(p)
            expect(result).toBeInstanceOf(Error)
            expect(result.cause).toBe(p)
        }
    })

    it('handles plain objects and arrays', () => {
        let obj = { foo: 'bar', nested: { x: 1 } }
        let arr = [1, 2, 3]

        let resultObj = unknownToError(obj)
        expect(resultObj.message).toBe(JSON.stringify(obj))
        expect(resultObj.cause).toBe(obj)

        let resultArr = unknownToError(arr)
        expect(resultArr.message).toBe(JSON.stringify(arr))
        expect(resultArr.cause).toBe(arr)
    })

    it('handles non-serializable objects gracefully (falls back to JSON)', () => {
        let circular: any = { self: null }
        circular.self = circular

        let result = unknownToError(circular)
        expect(result).toBeInstanceOf(Error)
        expect(result.cause).toBe(circular)
    })
})