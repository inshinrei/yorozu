export function isByobCapableStream(stream: ReadableStream<Uint8Array>): boolean {
    try {
        let reader = stream.getReader({ mode: "byob" })
        reader.releaseLock()
        return true
    } catch (err) {
        if (err instanceof TypeError) return false
        throw err
    }
}
