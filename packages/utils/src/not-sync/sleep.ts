export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms < 0) throw new RangeError("sleep: ms must be a non-negative number")

    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"))
            return
        }

        let timeoutId = setTimeout(resolve, ms)

        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timeoutId)
                reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"))
            },
            { once: true },
        )
    })
}
