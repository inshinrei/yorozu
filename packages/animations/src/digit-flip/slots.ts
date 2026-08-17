export const DIGIT_FLIP_MS: number = 200
export const MAX_SIMULTANEOUS_DIGIT_FLIPS: number = 10

export type DigitSlot =
    | { kind: "static"; char: string }
    | { kind: "flip"; char: string; prevChar: string }

export function buildDigitSlots(text: string, prevText: string | undefined, shouldAnimate: boolean): DigitSlot[] {
    if (!shouldAnimate || prevText === undefined || prevText === text) {
        return [...text].map((char) => ({ kind: "static" as const, char }))
    }

    let slots: DigitSlot[] = []
    let textLength = text.length
    let prevLength = prevText.length

    for (let i = 0; i < textLength; i++) {
        let charIndex = textLength - 1 - i
        let prevIndex = prevLength - 1 - i
        let char = text[charIndex]!
        let prevChar = prevIndex >= 0 ? prevText[prevIndex]! : ""
        if (char !== prevChar) slots.unshift({ kind: "flip", char, prevChar })
        else slots.unshift({ kind: "static", char })
    }
    return slots
}

export function formatCounterText(value: number): string {
    let n = Math.max(0, Math.floor(value))
    return n >= 1000 ? "999+" : String(n)
}

export function shouldPresencePop(prev: number | undefined, next: number): boolean {
    return prev === 0 && next > 0
}

let scheduled = 0
let resetQueued = false

export function scheduleDigitFlip(condition: boolean): boolean {
    if (!condition || scheduled >= MAX_SIMULTANEOUS_DIGIT_FLIPS) return false
    if (!resetQueued) {
        resetQueued = true
        setTimeout(() => {
            scheduled = 0
            resetQueued = false
        }, 0)
    }
    scheduled += 1
    return true
}
