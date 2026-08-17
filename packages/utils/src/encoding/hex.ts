import { u8 } from "../arrays"

const hexSliceLookupTable = (function () {
    const alphabet = "0123456789abcdef"
    const table: string[] = Array.from({ length: 256 })

    for (let i = 0; i < 16; ++i) {
        const i16 = i * 16

        for (let j = 0; j < 16; ++j) {
            table[i16 + j] = alphabet[i] + alphabet[j]
        }
    }

    return table
})()

const hexCharValueTable: Record<string, number> = {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    a: 10,
    b: 11,
    c: 12,
    d: 13,
    e: 14,
    f: 15,
    A: 10,
    B: 11,
    C: 12,
    D: 13,
    E: 14,
    F: 15,
}

declare const Buffer: typeof import("node:buffer").Buffer
declare const Uint8Array: Uint8ArrayConstructor & {
    fromHex?: (hex: string) => Uint8Array
}

const HasToHex = typeof Uint8Array.prototype.toHex === "function"

export function encode(buf: Uint8Array): string {
    if (typeof Buffer !== "undefined") return Buffer.from(buf).toString("hex")
    if (HasToHex) return buf.toHex()
    let out = ""
    for (let i = 0; i < buf.byteLength; ++i) out += hexSliceLookupTable[buf[i]]
    return out
}

export function decode(data: string): Uint8Array {
    // Buffer.from(str, "hex") is silent on odd length and non-hex characters
    if (typeof Uint8Array.fromHex === "function") return Uint8Array.fromHex(data)
    if (data.length % 2 !== 0) throw new TypeError("Invalid hex string.", { cause: { data } })
    let buf = u8.allocate(data.length / 2)
    for (let i = 0; i < buf.length; ++i) {
        let a = hexCharValueTable[data[i * 2]]
        let b = hexCharValueTable[data[i * 2 + 1]]
        if (a === undefined || b === undefined) throw new TypeError("Invalid hex string.", { cause: { data } })
        buf[i] = (a << 4) | b
    }
    return buf
}

export function encodedLength(n: number): number {
    return n * 2
}

export function decodedLength(n: number): number {
    return Math.ceil(n / 2)
}
