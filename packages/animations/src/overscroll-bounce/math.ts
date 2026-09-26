export const OVERSCROLL_COEFF: number = 0.55

export function rubberBandOverscroll(overscroll: number, dim: number, coeff: number = OVERSCROLL_COEFF): number {
    if (dim <= 0 || overscroll === 0 || coeff <= 0) return 0
    let sign = overscroll > 0 ? 1 : -1
    let x = overscroll * sign
    return sign * (1 - 1 / ((x * coeff) / dim + 1)) * dim
}
