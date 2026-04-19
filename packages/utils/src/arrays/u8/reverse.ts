import { allocate } from "./pool"

export function reverse(buffer: Uint8Array): void {
    if (buffer.length < 2) return

    let left = 0
    let right = buffer.length - 1

    while (left < right) {
        let tmp = buffer[left]
        buffer[left] = buffer[right]
        buffer[right] = tmp
        left++
        right--
    }
}

export function toReversed(buffer: ArrayLike<number>): Uint8Array {
    let len = buffer.length

    if (len === 0) return allocate(0)
    if (len === 1) {
        let result = allocate(1)
        result[0] = buffer[0]
        return result
    }

    let result = allocate(len)
    let last = len - 1

    for (let i = 0; i < len; i++) {
        result[i] = buffer[last - i]
    }

    return result
}
