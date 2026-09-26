export const OVERSCROLL_COEFF: number = 0.55

export function rubberBandOverscroll(overscroll: number, dim: number, coeff: number = OVERSCROLL_COEFF): number {
    if (dim <= 0 || overscroll === 0 || coeff <= 0) return 0
    let sign = overscroll > 0 ? 1 : -1
    let x = overscroll * sign
    return sign * (1 - 1 / ((x * coeff) / dim + 1)) * dim
}

export const OVERSCROLL_APPKIT_STIFFNESS: number = 20
export const OVERSCROLL_SPRING_AMPLITUDE: number = 0.31
export const OVERSCROLL_SPRING_PERIOD: number = 1.6
export const OVERSCROLL_SPRING_RATE: number = 12.5
export const OVERSCROLL_SPRING_DONE_PX: number = 0.5
export const OVERSCROLL_SPRING_MIN_MS: number = 24
export const OVERSCROLL_SPRING_MAX_MS: number = 500
export const OVERSCROLL_SPRING_V_MAX: number = 2000
export const OVERSCROLL_VELOCITY_ZERO_MS: number = 100

export type OverscrollMap = "ios" | "appkit"

export function rubberBandAppKit(overscroll: number, stiffness: number = OVERSCROLL_APPKIT_STIFFNESS): number {
    if (stiffness <= 0 || overscroll === 0) return 0
    return overscroll / stiffness
}

export function elasticOverscrollAt(x0: number, v0: number, elapsedSec: number): number {
    if (elapsedSec <= 0) return x0
    return (x0 + OVERSCROLL_SPRING_AMPLITUDE * v0 * elapsedSec) * Math.exp(-OVERSCROLL_SPRING_RATE * elapsedSec)
}

export function invertOverscrollVisual(
    visual: number,
    map: OverscrollMap,
    dim: number,
    coeff: number = OVERSCROLL_COEFF,
    stiffness: number = OVERSCROLL_APPKIT_STIFFNESS,
): number {
    if (visual === 0) return 0
    if (map === "appkit") {
        if (stiffness <= 0) return 0
        return visual * stiffness
    }
    if (dim <= 0 || coeff <= 0) return 0
    let sign = visual > 0 ? 1 : -1
    let b = Math.min(visual * sign, dim * 0.99)
    return (sign * (b * dim)) / (coeff * (dim - b))
}

export function overscrollVisual(
    raw: number,
    map: OverscrollMap,
    dim: number,
    coeff: number = OVERSCROLL_COEFF,
    stiffness: number = OVERSCROLL_APPKIT_STIFFNESS,
): number {
    if (map === "appkit") return rubberBandAppKit(raw, stiffness)
    return rubberBandOverscroll(raw, dim, coeff)
}
