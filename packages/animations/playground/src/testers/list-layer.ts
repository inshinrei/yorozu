import {
    createViewSlide,
    resolveViewSlideMode,
    VIEW_SLIDE_COVER_MS,
    VIEW_SLIDE_MS,
    VIEW_SLIDE_SETTLE_SLACK_MS,
    type Key,
} from "@yorozu/animations"
import { getAnimationLevel } from "../level"

type Layer = {
    id: string
    title: string
    rows: string[]
}

let inbox: Layer = {
    id: "inbox",
    title: "Inbox",
    rows: ["Ada", "Lin", "Priya", "Noah", "Stored"],
}

let stored: Layer = {
    id: "stored",
    title: "Stored",
    rows: ["Old thread", "Muted group", "Backup", "Back"],
}

export function mountListLayer(root: HTMLElement): () => void {
    let active = inbox.id
    let nodes = new Map<Key, HTMLElement>()
    let raf = 0
    let settleTimer = 0

    let slide = createViewSlide({
        getMode: () => resolveViewSlideMode(getAnimationLevel(), "layer"),
        getDirection: (from, to) => {
            if (from === inbox.id && to === stored.id) return "forward"
            if (from === stored.id && to === inbox.id) return "back"
            return null
        },
        mountPolicy: "active-plus-leaving",
    })

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Open Stored to cover the inbox list. Back reverses the layer."

    let viewport = document.createElement("div")
    viewport.className = "pg-slide-view"

    tester.append(hint, viewport)
    root.append(tester)

    function paintLayer(el: HTMLElement, layer: Layer): void {
        el.replaceChildren()
        let title = document.createElement("h3")
        title.textContent = layer.title
        el.append(title)
        for (let label of layer.rows) {
            let row = document.createElement("button")
            row.type = "button"
            row.className = "pg-list-row"
            row.textContent = label
            if (layer.id === inbox.id && label === "Stored") {
                row.addEventListener("click", () => goTo(stored.id))
            } else if (layer.id === stored.id && label === "Back") {
                row.addEventListener("click", () => goTo(inbox.id))
            }
            el.append(row)
        }
    }

    function dropUnused(): void {
        for (let [key, node] of nodes) {
            if (slide.mountedKeys.includes(key)) continue
            node.remove()
            nodes.delete(key)
        }
    }

    function syncPanels(): void {
        for (let key of slide.mountedKeys) {
            let node = nodes.get(key)
            if (!node) {
                let layer = key === stored.id ? stored : inbox
                node = document.createElement("div")
                node.className = "pg-slide-panel pg-layer-panel"
                paintLayer(node, layer)
                viewport.append(node)
                slide.attach(node, key)
                nodes.set(key, node)
            }
            node.style.visibility = slide.isVisible(key) ? "visible" : "hidden"
            node.style.zIndex = key === stored.id ? "2" : "1"
        }
        dropUnused()
    }

    function watchSettle(): void {
        cancelAnimationFrame(raf)
        window.clearTimeout(settleTimer)
        let tick = (): void => {
            syncPanels()
            if (slide.animating) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        let ms = getAnimationLevel() === "high" ? VIEW_SLIDE_COVER_MS : VIEW_SLIDE_MS
        settleTimer = window.setTimeout(() => syncPanels(), ms + VIEW_SLIDE_SETTLE_SLACK_MS + 16)
    }

    function goTo(key: string): void {
        if (key === active) return
        active = key
        slide.setActive(key)
        syncPanels()
        watchSettle()
    }

    slide.setActive(active)
    syncPanels()

    return () => {
        cancelAnimationFrame(raf)
        window.clearTimeout(settleTimer)
        slide.destroy()
    }
}
