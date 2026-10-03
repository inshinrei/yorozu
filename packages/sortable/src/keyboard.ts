import { toTargetIndex } from "./geometry"

export function isTypingField(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    return target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') != null
}

export function destinationToInsertIndex(srcIdx: number, dest: number): number {
    if (dest <= srcIdx) return dest
    return dest + 1
}

export function stepDestination(srcIdx: number, insertIndex: number, delta: number, length: number): number {
    if (length <= 0) return 0
    let dest = toTargetIndex(srcIdx, insertIndex)
    return Math.max(0, Math.min(length - 1, dest + delta))
}
