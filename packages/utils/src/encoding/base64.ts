import { u8 } from "../arrays"
import { decoder, encoder } from "./utf8"

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

export const lookup: Map<number, number> = new Map<number, number>()
export const encodeLookup: Map<number, number> = new Map<number, number>()

for (let i = 0; i < alphabet.length; i++) {
    const charCode = alphabet.charCodeAt(i)
    lookup.set(charCode, i)
    encodeLookup.set(i, charCode)
}

// Special Base64 cases
lookup.set("=".charCodeAt(0), 0)
lookup.set("-".charCodeAt(0), 62)
lookup.set("_".charCodeAt(0), 63)

declare const Buffer: typeof import("node:buffer").Buffer

const HasToBase64 = typeof Uint8Array.prototype.toBase64 === "function"
const HasFromBase64 = typeof Uint8Array.fromBase64 === "function"

export function decode(data: string, url: boolean = false): Uint8Array {
    if (typeof Buffer !== "undefined") {
        let buf = Buffer.from(data, url ? "base64url" : "base64")
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    }
    if (HasFromBase64) return Uint8Array.fromBase64(data, { alphabet: url ? "base64url" : "base64" })
    data = data.replace(/=+$/g, "")
    let n = data.length
    let rem = n % 4
    let k = rem && rem - 1
    let m = (n >> 2) * 3 + k
    let encoded = u8.allocate(n + 3)
    encoder.encodeInto(`${data}===`, encoded)
    for (let i = 0, j = 0; i < n; i += 4, j += 3) {
        let x =
            (lookup.get(encoded[i])! << 18) +
            (lookup.get(encoded[i + 1])! << 12) +
            (lookup.get(encoded[i + 2])! << 6) +
            lookup.get(encoded[i + 3])!
        encoded[j] = x >> 16
        encoded[j + 1] = (x >> 8) & 0xff
        encoded[j + 2] = x & 0xff
    }
    return new Uint8Array(encoded.buffer, encoded.byteOffset, m)
}

const ToBase64Options = { alphabet: "base64", omitPadding: false } as const
const ToBase64UrlOptions = { alphabet: "base64url", omitPadding: true } as const
export function encode(bytes: Uint8Array, url: boolean = false): string {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString(url ? "base64url" : "base64")
    if (HasToBase64) return bytes.toBase64(url ? ToBase64UrlOptions : ToBase64Options)
    let m = bytes.length
    let k = m % 3
    let n = Math.floor(m / 3) * 4 + (k && k + 1)
    let N = Math.ceil(m / 3) * 4
    let encoded = u8.allocate(N)
    for (let i = 0, j = 0; j < m; i += 4, j += 3) {
        let y = (bytes[j] << 16) + (bytes[j + 1] << 8) + (bytes[j + 2] | 0)
        encoded[i] = encodeLookup.get(y >> 18)!
        encoded[i + 1] = encodeLookup.get((y >> 12) & 0x3f)!
        encoded[i + 2] = encodeLookup.get((y >> 6) & 0x3f)!
        encoded[i + 3] = encodeLookup.get(y & 0x3f)!
    }

    let base64 = decoder.decode(new Uint8Array(encoded.buffer, encoded.byteOffset, n))
    if (url) base64 = base64.replace(/\+/g, "-").replace(/\//g, "_")
    else {
        if (k === 1) base64 += "=="
        if (k === 2) base64 += "="
    }

    return base64
}

export function encodedLength(n: number): number {
    return Math.ceil(n / 3) * 4
}

export function decodedLength(n: number): number {
    let rem = n % 4
    return (n >> 2) * 3 + (rem && rem - 1)
}
