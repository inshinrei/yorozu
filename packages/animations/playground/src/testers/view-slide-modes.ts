import {
    canAnimate,
    createViewSlide,
    slideDirectionByIndex,
    viewSlideDurationMs,
    VIEW_SLIDE_SETTLE_SLACK_MS,
    type Key,
    type ViewSlideMode,
} from "@yorozu/animations"
import { getAnimationLevel } from "../level"

type ExtraMode = "peek" | "lift" | "zoom" | "reveal"

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

let MODE_ORDER: ExtraMode[] = ["peek", "lift", "zoom", "reveal"]

let MODE_HINT: Record<ExtraMode, string> = {
    peek: "Incoming full-width slide; outgoing eases ~20% back and dims.",
    lift: "Vertical translate ±100% between stacked panels.",
    zoom: "Scale 1.1 / 0.95 with a short opacity fade.",
    reveal: "Entering panel wipes in with clip-path inset.",
}

function darkTint(hsl: string): string {
    return hsl.replace("92%", "22%")
}

export function mountViewSlideModes(root: HTMLElement, initial: ExtraMode = "peek"): () => void {
    let active = panels[0]!.id
    let mode: ExtraMode = initial
    let items = panels.map((panel) => ({ id: panel.id }))
    let nodes = new Map<Key, HTMLElement>()
    let raf = 0
    let settleTimer = 0

    let slide = createViewSlide({
        getMode: (): ViewSlideMode => (canAnimate(getAnimationLevel()) ? mode : "none"),
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

    let picker = document.createElement("div")
    picker.className = "pg-toolbar"
    picker.setAttribute("role", "group")
    picker.setAttribute("aria-label", "View slide mode")

    let modeBtns = new Map<ExtraMode, HTMLButtonElement>()
    for (let id of MODE_ORDER) {
        let btn = document.createElement("button")
        btn.type = "button"
        btn.className = "pg-btn"
        btn.textContent = id === "peek" ? "Peek slide" : id[0]!.toUpperCase() + id.slice(1)
        btn.setAttribute("aria-pressed", id === mode ? "true" : "false")
        btn.addEventListener("click", () => setMode(id))
        modeBtns.set(id, btn)
        picker.append(btn)
    }

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = MODE_HINT[mode]

    let viewport = document.createElement("div")
    viewport.className = "pg-slide-view"

    toolbar.append(prevBtn, nextBtn)
    tester.append(toolbar, picker, hint, viewport)
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
            node.style.visibility = slide.isVisible(key) ? "visible" : "hidden"
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
        let ms = canAnimate(getAnimationLevel()) ? viewSlideDurationMs(mode) : 0
        settleTimer = window.setTimeout(() => syncPanels(), ms + VIEW_SLIDE_SETTLE_SLACK_MS + 16)
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

    function setMode(next: ExtraMode): void {
        mode = next
        hint.textContent = MODE_HINT[mode]
        for (let [id, btn] of modeBtns) btn.setAttribute("aria-pressed", id === mode ? "true" : "false")
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
