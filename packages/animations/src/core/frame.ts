type FrameListener = (t: number) => void

let listeners: FrameListener[] = []
let rafId = 0

let pump = (now: number): void => {
    let snapshot = [...listeners]
    for (let fn of snapshot) fn(now)
    if (listeners.length) {
        rafId = requestAnimationFrame(pump)
    } else {
        rafId = 0
    }
}

export function onAnimationFrame(fn: (t: number) => void): () => void {
    listeners.push(fn)
    if (rafId === 0) {
        rafId = requestAnimationFrame(pump)
    }
    let stopped = false
    return (): void => {
        if (stopped) return
        stopped = true
        let i = listeners.indexOf(fn)
        if (i >= 0) listeners.splice(i, 1)
        if (!listeners.length && rafId) {
            cancelAnimationFrame(rafId)
            rafId = 0
        }
    }
}
