export const WHEEL_QUIET_PX: number = 10
export const WHEEL_RELEASE_MS: number = 140
export const WHEEL_COOLDOWN_MS: number = 420
export const WHEEL_MOMENTUM_DT_MS: number = 40
export const WHEEL_MOMENTUM_ACCEL_MIN: number = 0.55
export const WHEEL_MOMENTUM_ACCEL_MAX: number = 0.97
export const WHEEL_MOMENTUM_PEAK_PX: number = 18
export const WHEEL_MOMENTUM_WINDOW: number = 4

export type WheelNoteKind = "gated" | "quiet" | "move" | "coast"
export type WheelPhase = "idle" | "contact" | "coast"

export type WheelNoteMeta = {
    momentum?: boolean
    timeStamp?: number
}

export type WheelSessionOptions = {
    quietPx?: number
    releaseMs?: number
    cooldownMs?: number
    onRelease: () => void
}

export type WheelSession = {
    note: (deltaX: number, deltaY: number, meta?: WheelNoteMeta) => WheelNoteKind
    consume: () => void
    gated: () => boolean
    active: () => boolean
    clear: () => void
    destroy: () => void
}

type WheelSample = {
    mag: number
    sign: number
    time: number
}

export function isQuietWheel(deltaX: number, deltaY: number, quietPx: number = WHEEL_QUIET_PX): boolean {
    return Math.abs(deltaX) < quietPx && Math.abs(deltaY) < quietPx
}

function axisSign(deltaX: number, deltaY: number): number {
    if (Math.abs(deltaX) >= Math.abs(deltaY)) return Math.sign(deltaX)
    return Math.sign(deltaY)
}

export function createWheelSession(options: WheelSessionOptions): WheelSession {
    let quietPx = options.quietPx ?? WHEEL_QUIET_PX
    let releaseMs = options.releaseMs ?? WHEEL_RELEASE_MS
    let cooldownMs = options.cooldownMs ?? WHEEL_COOLDOWN_MS
    let isGated = false
    let cooldownElapsed = false
    let phase: WheelPhase = "idle"
    let releasedThisGesture = false
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let cooldownTimer: ReturnType<typeof setTimeout> | null = null
    let destroyed = false
    let samples: WheelSample[] = []
    let peakMag = 0
    let lastMag = 0

    function clearIdle(): void {
        if (idleTimer == null) return
        clearTimeout(idleTimer)
        idleTimer = null
    }

    function clearCooldown(): void {
        if (cooldownTimer == null) return
        clearTimeout(cooldownTimer)
        cooldownTimer = null
    }

    function resetContact(): void {
        samples = []
        peakMag = 0
        lastMag = 0
        releasedThisGesture = false
    }

    function fireRelease(next: WheelPhase): void {
        if (releasedThisGesture) {
            phase = next
            return
        }
        releasedThisGesture = true
        phase = next
        clearIdle()
        options.onRelease()
        if (next === "coast") armIdle()
    }

    function armIdle(): void {
        clearIdle()
        idleTimer = setTimeout(() => {
            idleTimer = null
            if (destroyed) return
            if (phase === "contact") {
                fireRelease("idle")
                return
            }
            if (phase === "coast") phase = "idle"
        }, releaseMs)
    }

    function looksLikeMomentum(mag: number, sign: number, time: number): boolean {
        if (phase !== "contact") return false
        if (samples.length + 1 < WHEEL_MOMENTUM_WINDOW) return false
        if (Math.max(peakMag, mag) < WHEEL_MOMENTUM_PEAK_PX) return false
        let window: WheelSample[] = samples.slice(-(WHEEL_MOMENTUM_WINDOW - 1))
        window.push({ mag, sign, time })
        for (let i = 1; i < window.length; i++) {
            let dt = window[i].time - window[i - 1].time
            if (dt >= WHEEL_MOMENTUM_DT_MS) return false
            if (window[i].sign === 0 || window[i].sign !== window[i - 1].sign) return false
            if (window[i - 1].mag <= 0) return false
            let acc = window[i].mag / window[i - 1].mag
            if (acc < WHEEL_MOMENTUM_ACCEL_MIN || acc > WHEEL_MOMENTUM_ACCEL_MAX) return false
        }
        return true
    }

    function beginContact(): void {
        phase = "contact"
        resetContact()
    }

    function note(deltaX: number, deltaY: number, meta: WheelNoteMeta = {}): WheelNoteKind {
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

        let mag = Math.hypot(deltaX, deltaY)
        let now =
            typeof meta.timeStamp === "number" && Number.isFinite(meta.timeStamp) ? meta.timeStamp : performance.now()
        let sign = axisSign(deltaX, deltaY)

        if (meta.momentum === true) {
            if (phase === "contact") fireRelease("coast")
            else {
                phase = "coast"
                armIdle()
            }
            lastMag = mag
            return "coast"
        }

        if (meta.momentum === false && phase === "coast") beginContact()

        if (phase === "contact" && looksLikeMomentum(mag, sign, now)) {
            fireRelease("coast")
            lastMag = mag
            return "coast"
        }

        if (mag === 0 && phase === "contact") {
            armIdle()
            return "quiet"
        }

        if (phase === "coast") {
            if (mag > lastMag * 1.6 && mag > WHEEL_MOMENTUM_PEAK_PX) {
                beginContact()
            } else {
                lastMag = mag
                armIdle()
                return "coast"
            }
        }

        if (phase === "idle") beginContact()

        samples.push({ mag, sign, time: now })
        if (mag > peakMag) peakMag = mag
        lastMag = mag
        armIdle()
        return "move"
    }

    function consume(): void {
        if (destroyed) return
        phase = "idle"
        resetContact()
        clearIdle()
        isGated = true
        cooldownElapsed = false
        clearCooldown()
        cooldownTimer = setTimeout(() => {
            cooldownTimer = null
            cooldownElapsed = true
        }, cooldownMs)
    }

    function clear(): void {
        clearIdle()
        clearCooldown()
        isGated = false
        cooldownElapsed = false
        phase = "idle"
        resetContact()
    }

    function destroy(): void {
        destroyed = true
        clear()
    }

    return {
        note,
        consume,
        gated: () => isGated,
        active: () => phase === "contact",
        clear,
        destroy,
    }
}
