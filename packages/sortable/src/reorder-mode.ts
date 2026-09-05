export type ReorderMode = {
    get isActive(): boolean
    enter(): void
    exit(): void
    subscribe(listener: () => void): () => void
}

export function createReorderMode(): ReorderMode {
    let active = false
    let listeners = new Set<() => void>()

    function notify(): void {
        for (let listener of listeners) listener()
    }

    return {
        get isActive() {
            return active
        },
        enter() {
            if (active) return
            active = true
            notify()
        },
        exit() {
            if (!active) return
            active = false
            notify()
        },
        subscribe(listener: () => void) {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
    }
}
