export type IdleDeadline = {
    didTimeout: boolean
    timeRemaining(): number
}

export type IdleHandle = {
    cancel(): void
}

type Ric = (fn: (deadline: IdleDeadline) => void, opts?: { timeout?: number }) => number

export function requestIdle(fn: (deadline: IdleDeadline) => void, opts?: { timeout?: number }): IdleHandle {
    let g = globalThis as unknown as {
        requestIdleCallback?: Ric
        cancelIdleCallback?: (id: number) => void
    }
    let timeout = opts?.timeout
    if (typeof g.requestIdleCallback === "function") {
        let ricOpts: { timeout: number } | undefined
        if (timeout !== undefined) {
            // rIC ignores timeout <= 0; a 1ms cap is still a deadline.
            ricOpts = { timeout: timeout > 0 ? timeout : 1 }
        }
        let id = g.requestIdleCallback(fn, ricOpts)
        return {
            cancel(): void {
                g.cancelIdleCallback?.(id)
            },
        }
    }
    let delay = 0
    if (typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0) delay = timeout
    let timer = setTimeout(() => {
        fn({
            didTimeout: true,
            timeRemaining(): number {
                return 0
            },
        })
    }, delay)
    return {
        cancel(): void {
            clearTimeout(timer)
        },
    }
}
