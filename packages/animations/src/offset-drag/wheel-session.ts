export const WHEEL_QUIET_PX: number = 10
export const WHEEL_RELEASE_MS: number = 90
export const WHEEL_COOLDOWN_MS: number = 420

export type WheelNoteKind = "gated" | "quiet" | "move"

export type WheelSessionOptions = {
    quietPx?: number
    releaseMs?: number
    cooldownMs?: number
    onRelease: () => void
}

export type WheelSession = {
    note: (deltaX: number, deltaY: number) => WheelNoteKind
    consume: () => void
    gated: () => boolean
    active: () => boolean
    clear: () => void
    destroy: () => void
}

export function isQuietWheel(deltaX: number, deltaY: number, quietPx: number = WHEEL_QUIET_PX): boolean {
    return Math.abs(deltaX) < quietPx && Math.abs(deltaY) < quietPx
}

export function createWheelSession(options: WheelSessionOptions): WheelSession {
    let quietPx = options.quietPx ?? WHEEL_QUIET_PX
    let releaseMs = options.releaseMs ?? WHEEL_RELEASE_MS
    let cooldownMs = options.cooldownMs ?? WHEEL_COOLDOWN_MS
    let isGated = false
    let isActive = false
    let cooldownElapsed = false
    let releaseTimer: ReturnType<typeof setTimeout> | null = null
    let cooldownTimer: ReturnType<typeof setTimeout> | null = null
    let destroyed = false

    function clearRelease(): void {
        if (releaseTimer == null) return
        clearTimeout(releaseTimer)
        releaseTimer = null
    }

    function clearCooldown(): void {
        if (cooldownTimer == null) return
        clearTimeout(cooldownTimer)
        cooldownTimer = null
    }

    function armRelease(): void {
        clearRelease()
        releaseTimer = setTimeout(() => {
            releaseTimer = null
            if (destroyed || !isActive) return
            isActive = false
            options.onRelease()
        }, releaseMs)
    }

    function note(deltaX: number, deltaY: number): WheelNoteKind {
        if (destroyed) return "gated"
        let quiet = isQuietWheel(deltaX, deltaY, quietPx)
        if (isGated) {
            if (cooldownElapsed && quiet) {
                isGated = false
                cooldownElapsed = false
                return "quiet"
            }
            return "gated"
        }
        if (quiet) return "quiet"
        isActive = true
        armRelease()
        return "move"
    }

    function consume(): void {
        if (destroyed) return
        isActive = false
        clearRelease()
        isGated = true
        cooldownElapsed = false
        clearCooldown()
        cooldownTimer = setTimeout(() => {
            cooldownTimer = null
            cooldownElapsed = true
        }, cooldownMs)
    }

    function clear(): void {
        clearRelease()
        clearCooldown()
        isGated = false
        isActive = false
        cooldownElapsed = false
    }

    function destroy(): void {
        destroyed = true
        clear()
    }

    return {
        note,
        consume,
        gated: () => isGated,
        active: () => isActive,
        clear,
        destroy,
    }
}
