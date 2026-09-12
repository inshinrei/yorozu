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
    if (typeof g.requestIdleCallback === "function") {
        let id = g.requestIdleCallback(fn, opts?.timeout !== undefined ? { timeout: opts.timeout } : undefined)
        return {
            cancel(): void {
                g.cancelIdleCallback?.(id)
            },
        }
    }
    let timer = setTimeout(() => {
        fn({
            didTimeout: true,
            timeRemaining(): number {
                return 0
            },
        })
    }, 0)
    return {
        cancel(): void {
            clearTimeout(timer)
        },
    }
}
