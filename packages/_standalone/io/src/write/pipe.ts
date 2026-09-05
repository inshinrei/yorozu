import { Readable, Writable } from "../types"

export async function pipe(into: Writable, readable: Readable): Promise<void> {
    let chunk = new Uint8Array(1024 * 32)
    while (true) {
        let nread = await readable.read(chunk)
        if (nread === 0) break
        await into.write(chunk.subarray(0, nread))
    }
}
