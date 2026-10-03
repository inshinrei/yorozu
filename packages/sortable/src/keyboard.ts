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

export type SortableKeyboardSession = {
    itemEls: Map<string | number, HTMLElement>
    getPending(): boolean
    getDraggingKey(): string | number | null
    getKeyboardGrab(): boolean
    canDragKey(key: string | number): boolean
    grab(key: string | number): void
    moveTo(dest: number): void
    drop(): void
    cancel(): void
    srcAndInsert(): { srcIdx: number; insertIndex: number; length: number } | null
}

export function attachSortableKeyboard(session: SortableKeyboardSession): {
    onRegister(): void
    onUnregister(): void
} {
    let keydownBound = false
    let focusoutBound = false

    function syncFocusout(): void {
        if (typeof document === "undefined") return
        let want = session.getKeyboardGrab()
        if (want && !focusoutBound) {
            document.addEventListener("focusout", onFocusOut)
            focusoutBound = true
        } else if (!want && focusoutBound) {
            document.removeEventListener("focusout", onFocusOut)
            focusoutBound = false
        }
    }

    function onKeyDown(event: Event): void {
        if (!(event instanceof KeyboardEvent)) return
        let key = event.key
        if (key === "Escape" && (session.getPending() || session.getDraggingKey() != null)) {
            event.preventDefault()
            event.stopPropagation()
            session.cancel()
            syncFocusout()
            return
        }
        if (event.ctrlKey || event.metaKey || event.altKey) return
        if (isTypingField(event.target)) return
        if (session.getPending() || (session.getDraggingKey() != null && !session.getKeyboardGrab())) {
            return
        }
        if (session.getKeyboardGrab()) {
            let delta = 0
            if (key === "ArrowUp" || key === "ArrowLeft") delta = -1
            else if (key === "ArrowDown" || key === "ArrowRight") delta = 1
            else if (key === " " || key === "Enter") {
                event.preventDefault()
                session.drop()
                syncFocusout()
                return
            } else return
            let info = session.srcAndInsert()
            if (info == null) return
            event.preventDefault()
            session.moveTo(stepDestination(info.srcIdx, info.insertIndex, delta, info.length))
            return
        }
        if (key !== " " && key !== "Enter") return
        let active = document.activeElement
        let found: string | number | null = null
        for (let [itemKey, node] of session.itemEls) {
            if (node === active || (active instanceof Node && node.contains(active))) {
                found = itemKey
                break
            }
        }
        if (found == null || !session.canDragKey(found)) return
        event.preventDefault()
        session.grab(found)
        syncFocusout()
    }

    function onFocusOut(event: Event): void {
        if (!session.getKeyboardGrab()) return
        let dragging = session.getDraggingKey()
        if (dragging == null) return
        let node = session.itemEls.get(dragging)
        let related = (event as FocusEvent).relatedTarget
        if (node && related instanceof Node && node.contains(related)) return
        session.cancel()
        syncFocusout()
    }

    function detachAll(): void {
        if (typeof document === "undefined") return
        if (keydownBound) {
            document.removeEventListener("keydown", onKeyDown)
            keydownBound = false
        }
        if (focusoutBound) {
            document.removeEventListener("focusout", onFocusOut)
            focusoutBound = false
        }
    }

    return {
        onRegister(): void {
            if (typeof document === "undefined") return
            if (session.itemEls.size >= 1 && !keydownBound) {
                document.addEventListener("keydown", onKeyDown)
                keydownBound = true
            }
        },
        onUnregister(): void {
            if (session.itemEls.size > 0) return
            if (session.getKeyboardGrab() || session.getDraggingKey() != null) {
                session.cancel()
            }
            detachAll()
        },
    }
}
