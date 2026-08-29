export function createListenerSet(): {
    subscribe(listener: () => void): () => void
    notify(): void
} {
    let listeners = new Set<() => void>()
    return {
        subscribe(listener: () => void): () => void {
            listeners.add(listener)
            return (): void => {
                listeners.delete(listener)
            }
        },
        notify(): void {
            for (let listener of [...listeners]) {
                try {
                    listener()
                } catch {
                    // listener errors must not reject the store write
                }
            }
        },
    }
}
