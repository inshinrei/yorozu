export type MediaViewerKeyHandlers = {
    close: () => void
    prev: () => void
    next: () => void
    zoomIn: () => void
    zoomOut: () => void
    resetZoom: () => void
    getAllowSwitch: () => boolean
    getAllowZoom: () => boolean
}

export function bindMediaViewerKeys(handlers: MediaViewerKeyHandlers, target?: EventTarget): () => void {
    let root = target ?? document
    let bound = true

    function onKeyDown(event: Event): void {
        if (!(event instanceof KeyboardEvent)) return
        let key = event.key
        if (key === "Escape") {
            handlers.close()
            return
        }
        if (event.metaKey || event.ctrlKey) return
        if (key === "ArrowLeft") {
            if (!handlers.getAllowSwitch()) return
            event.preventDefault()
            handlers.prev()
            return
        }
        if (key === "ArrowRight") {
            if (!handlers.getAllowSwitch()) return
            event.preventDefault()
            handlers.next()
            return
        }
        if (key === "+" || key === "=") {
            if (!handlers.getAllowZoom()) return
            event.preventDefault()
            handlers.zoomIn()
            return
        }
        if (key === "-") {
            if (!handlers.getAllowZoom()) return
            event.preventDefault()
            handlers.zoomOut()
            return
        }
        if (key === "0") {
            if (!handlers.getAllowZoom()) return
            event.preventDefault()
            handlers.resetZoom()
        }
    }

    root.addEventListener("keydown", onKeyDown)
    return (): void => {
        if (!bound) return
        bound = false
        root.removeEventListener("keydown", onKeyDown)
    }
}
