export type ConfirmAnchor = { x: number; y: number }

let lastAnchor: ConfirmAnchor = { x: 0, y: 0 }

export function setLastConfirmAnchor(anchor: ConfirmAnchor): void {
    lastAnchor = { x: anchor.x, y: anchor.y }
}

export function lastConfirmAnchor(): ConfirmAnchor {
    return { x: lastAnchor.x, y: lastAnchor.y }
}

export function bindConfirmPointer(target?: EventTarget): () => void {
    let root = target ?? document
    const onPointerDown = (event: Event): void => {
        if (!(event instanceof PointerEvent)) return
        setLastConfirmAnchor({ x: event.clientX, y: event.clientY })
    }
    root.addEventListener("pointerdown", onPointerDown, true)
    return (): void => {
        root.removeEventListener("pointerdown", onPointerDown, true)
    }
}

export function resolveConfirmAnchor(input?: ConfirmAnchor | Event | null): ConfirmAnchor {
    if (input instanceof MouseEvent) {
        return { x: input.clientX, y: input.clientY }
    }
    if (input instanceof Event) {
        let current = input.currentTarget
        if (current instanceof Element) {
            let rect = current.getBoundingClientRect()
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        }
        return lastConfirmAnchor()
    }
    if (input != null && typeof input === "object" && "x" in input && "y" in input) {
        return { x: input.x, y: input.y }
    }
    return lastConfirmAnchor()
}

export function __resetConfirmAnchorForTests(): void {
    lastAnchor = { x: 0, y: 0 }
}
