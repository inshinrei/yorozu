import { describe, expect, it } from 'vitest'
import type { TypesAreEqual } from './equal'

describe('TypesAreEqual', () => {
    it('is true for identical types', () => {
        let same: TypesAreEqual<number, number> = true
        expect(same).toBe(true)
    })

    it('treats any as not equal to number', () => {
        type Result = TypesAreEqual<any, number>
        let isFalse: Result extends false ? true : false = true
        expect(isFalse).toBe(true)
    })
})
