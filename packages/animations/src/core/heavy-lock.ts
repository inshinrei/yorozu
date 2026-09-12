export type HeavyLockLevel = "any" | "blocking"

export const DEFAULT_HEAVY_LOCK_TIMEOUT_MS: number = 1000

export type HeavyAnimationLock = {
    acquire(reason: string, opts?: { level?: HeavyLockLevel; durationMs?: number }): () => void
    isHeld(): boolean
    level(): HeavyLockLevel | null
    subscribe(listener: () => void): () => void
}

type Token = {
    level: HeavyLockLevel
    released: boolean
    timer: ReturnType<typeof setTimeout> | null
}

export function createHeavyAnimationLock(opts?: {
    onLock?: (level: HeavyLockLevel) => void
    onUnlock?: () => void
    timeoutMs?: number
}): HeavyAnimationLock {
    let onLock = opts?.onLock
    let onUnlock = opts?.onUnlock
    let timeoutMs = opts?.timeoutMs ?? DEFAULT_HEAVY_LOCK_TIMEOUT_MS
    let tokens: Token[] = []
    let listeners = new Set<() => void>()
    let watchdog: ReturnType<typeof setTimeout> | null = null

    let liveTokens = (): Token[] => tokens.filter((t) => !t.released)

    let currentLevel = (): HeavyLockLevel | null => {
        let live = liveTokens()
        if (live.length === 0) return null
        if (live.some((t) => t.level === "blocking")) return "blocking"
        return "any"
    }

    let notify = (): void => {
        for (let listener of listeners) listener()
    }

    let clearWatchdog = (): void => {
        if (watchdog === null) return
        clearTimeout(watchdog)
        watchdog = null
    }

    let startWatchdog = (): void => {
        if (timeoutMs <= 0 || watchdog !== null) return
        watchdog = setTimeout(() => {
            watchdog = null
            let hadLive = false
            for (let token of tokens) {
                if (token.released) continue
                hadLive = true
                token.released = true
                if (token.timer !== null) {
                    clearTimeout(token.timer)
                    token.timer = null
                }
            }
            if (!hadLive) return
            tokens.length = 0
            onUnlock?.()
            notify()
        }, timeoutMs)
    }

    let releaseToken = (token: Token): void => {
        if (token.released) return
        let before = currentLevel()
        token.released = true
        if (token.timer !== null) {
            clearTimeout(token.timer)
            token.timer = null
        }
        let after = currentLevel()
        if (before === after) return
        if (after === null) {
            tokens.length = 0
            clearWatchdog()
            onUnlock?.()
            notify()
            return
        }
        notify()
    }

    let acquire = (reason: string, acquireOpts?: { level?: HeavyLockLevel; durationMs?: number }): (() => void) => {
        void reason
        let durationMs = acquireOpts?.durationMs
        if (durationMs !== undefined && durationMs <= 0) {
            return () => {}
        }

        let level: HeavyLockLevel = acquireOpts?.level ?? "any"
        let before = currentLevel()
        let token: Token = { level, released: false, timer: null }
        tokens.push(token)

        if (liveTokens().length === 1) {
            startWatchdog()
        }

        if (durationMs !== undefined && durationMs > 0) {
            token.timer = setTimeout(() => {
                token.timer = null
                releaseToken(token)
            }, durationMs)
        }

        let after = currentLevel()
        let unlockedToHeld = before === null && after !== null
        let upgraded = before === "any" && after === "blocking"
        if (unlockedToHeld || upgraded) {
            onLock?.(after!)
            notify()
        }

        return () => {
            releaseToken(token)
        }
    }

    return {
        acquire,
        isHeld: (): boolean => liveTokens().length > 0,
        level: (): HeavyLockLevel | null => currentLevel(),
        subscribe: (listener: () => void): (() => void) => {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
    }
}
