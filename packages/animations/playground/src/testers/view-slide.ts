import {
    createViewSlide,
    resolveViewSlideMode,
    slideDirectionByIndex,
    VIEW_SLIDE_MS,
    VIEW_SLIDE_SETTLE_SLACK_MS,
    type Key,
} from "@yorozu/animations"
import { getAnimationLevel } from "../level"

type Panel = {
    id: string
    title: string
    body: string
    tint: string
}

let panels: Panel[] = [
    { id: "alpha", title: "Alpha", body: "First stacked panel.", tint: "210 54% 92%" },
    { id: "beta", title: "Beta", body: "Second stacked panel.", tint: "265 48% 92%" },
    { id: "gamma", title: "Gamma", body: "Third stacked panel.", tint: "16 60% 92%" },
]

function darkTint(hsl: string): string {
    return hsl.replace("92%", "22%")
}

export function mountViewSlide(root: HTMLElement): () => void {
    let active = panels[0]!.id
    let items = panels.map((panel) => ({ id: panel.id }))
    let nodes = new Map<Key, HTMLElement>()
    let raf = 0
    let settleTimer = 0

    let slide = createViewSlide({
        getMode: () => resolveViewSlideMode(getAnimationLevel(), "stack"),
        getDirection: (from, to) => slideDirectionByIndex(from, to, items),
        mountPolicy: "keep-visited",
    })

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let toolbar = document.createElement("div")
    toolbar.className = "pg-toolbar"

    let prevBtn = document.createElement("button")
    prevBtn.type = "button"
    prevBtn.className = "pg-btn"
    prevBtn.textContent = "Prev"

    let nextBtn = document.createElement("button")
    nextBtn.type = "button"
    nextBtn.className = "pg-btn pg-btn-primary"
    nextBtn.textContent = "Next"

    let viewport = document.createElement("div")
    viewport.className = "pg-slide-view"

    toolbar.append(prevBtn, nextBtn)
    tester.append(toolbar, viewport)
    root.append(tester)

    function paintPanel(el: HTMLElement, panel: Panel): void {
        let dark = document.documentElement.dataset.theme === "dark"
        el.style.background = `hsl(${dark ? darkTint(panel.tint) : panel.tint})`
        el.replaceChildren()
        let title = document.createElement("h3")
        title.textContent = panel.title
        let body = document.createElement("p")
        body.textContent = panel.body
        el.append(title, body)
    }

    function syncPanels(): void {
        for (let key of slide.mountedKeys) {
            let node = nodes.get(key)
            if (!node) {
                let panel = panels.find((item) => item.id === key)
                if (!panel) continue
                node = document.createElement("div")
                node.className = "pg-slide-panel"
                paintPanel(node, panel)
                viewport.append(node)
                slide.attach(node, key)
                nodes.set(key, node)
            }
            let visible = slide.isVisible(key)
            node.style.visibility = visible ? "visible" : "hidden"
            let role = slide.role(key)
            node.style.zIndex = role === "entering" || role === "active" ? "2" : "1"
        }
    }

    function watchSettle(): void {
        cancelAnimationFrame(raf)
        window.clearTimeout(settleTimer)
        let tick = (): void => {
            syncPanels()
            if (slide.animating) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        settleTimer = window.setTimeout(() => syncPanels(), VIEW_SLIDE_MS + VIEW_SLIDE_SETTLE_SLACK_MS + 16)
    }

    function goTo(key: string): void {
        active = key
        slide.setActive(key)
        syncPanels()
        watchSettle()
    }

    function step(delta: number): void {
        let index = panels.findIndex((panel) => panel.id === active)
        let next = (index + delta + panels.length) % panels.length
        goTo(panels[next]!.id)
    }

    prevBtn.addEventListener("click", () => step(-1))
    nextBtn.addEventListener("click", () => step(1))

    slide.setActive(active)
    syncPanels()

    return () => {
        cancelAnimationFrame(raf)
        window.clearTimeout(settleTimer)
        slide.destroy()
    }
}
