export const encoder: TextEncoder = new TextEncoder()
export const decoder: TextDecoder = new TextDecoder()
declare const Buffer: typeof import("node:buffer").Buffer

export function encodedLength(data: string): number {
    if (typeof Buffer !== "undefined") return Buffer.byteLength(data, "utf8")
    let length = data.length
    for (let i = length - 1; i >= 0; i--) {
        let code = data.charCodeAt(i)
        if (code > 0x7f && code <= 0x7ff) length++
        else if (code > 0x7ff && code <= 0xffff) length += 2
        if (code >= 0xdc00 && code <= 0xdfff) i--
    }

    return length
}
