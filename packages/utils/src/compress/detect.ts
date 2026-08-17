import { decompress as inflate } from "./inflate"
import { decompress as gunzip } from "./gzip"
import { decompress as unzlib } from "./zlib"
import type { DecompressOptions } from "./types"

export function decompress(data: Uint8Array, options?: DecompressOptions): Uint8Array {
    if (data.length >= 2 && data[0] === 31 && data[1] === 139) return gunzip(data, options)
    if (data.length >= 2 && (data[0] & 15) === 8 && data[0] >> 4 <= 7 && ((data[0] << 8) | data[1]) % 31 === 0) {
        return unzlib(data, options)
    }
    return inflate(data, options)
}
