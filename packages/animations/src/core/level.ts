export type AnimationLevel = "low" | "med" | "high"

export const ANIMATION_LEVELS: readonly AnimationLevel[] = ["low", "med", "high"]

export const DEFAULT_ANIMATION_LEVEL: AnimationLevel = "high"

export function isAnimationLevel(value: unknown): value is AnimationLevel {
    return value === "low" || value === "med" || value === "high"
}

export function parseAnimationLevel(raw: unknown): AnimationLevel | null {
    if (typeof raw !== "string") return null
    let next = raw.trim().toLowerCase()
    return isAnimationLevel(next) ? next : null
}

export function defaultAnimationLevel(prefersReduced: boolean): AnimationLevel {
    return prefersReduced ? "med" : DEFAULT_ANIMATION_LEVEL
}

export function cycleAnimationLevel(level: AnimationLevel): AnimationLevel {
    let idx = ANIMATION_LEVELS.indexOf(level)
    if (idx < 0) return DEFAULT_ANIMATION_LEVEL
    return ANIMATION_LEVELS[(idx + 1) % ANIMATION_LEVELS.length]!
}

export function canAnimate(level: AnimationLevel): boolean {
    return level !== "low"
}

export function pickAnimationLevelFromRatio(t: number): AnimationLevel {
    if (t < 1 / 3) return "low"
    if (t < 2 / 3) return "med"
    return "high"
}

export function stepAnimationLevel(level: AnimationLevel, delta: number): AnimationLevel {
    let idx = ANIMATION_LEVELS.indexOf(level)
    if (idx < 0) return DEFAULT_ANIMATION_LEVEL
    let next = idx + delta
    if (next < 0) return ANIMATION_LEVELS[0]!
    if (next >= ANIMATION_LEVELS.length) return ANIMATION_LEVELS[ANIMATION_LEVELS.length - 1]!
    return ANIMATION_LEVELS[next]!
}
