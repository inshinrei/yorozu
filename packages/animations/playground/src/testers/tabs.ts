import {
    canAnimate,
    createSlidingIndicator,
    createViewSlide,
    resolveViewSlideMode,
    slideDirectionByIndex,
    VIEW_SLIDE_MS,
    VIEW_SLIDE_SETTLE_SLACK_MS,
    type Key,
} from "@yorozu/animations"
import { getAnimationLevel } from "../level"

type Tab = {
    id: string
    label: string
    title: string
    body: string
    tint: string
}

let tabs: Tab[] = [
    { id: "one", label: "One", title: "One", body: "Short tab, first panel.", tint: "210 54% 92%" },
    { id: "second", label: "Second tab", title: "Second", body: "Wider label, second panel.", tint: "265 48% 92%" },
    { id: "iii", label: "III", title: "Three", body: "Narrow label, third panel.", tint: "16 60% 92%" },
    { id: "fourth", label: "Fourth label", title: "Four", body: "Longer label, fourth panel.", tint: "150 40% 90%" },
    { id: "five", label: "5", title: "Five", body: "Compact label, fifth panel.", tint: "330 45% 92%" },
]

function darkTint(hsl: string): string {
    return hsl.replace("92%", "22%").replace("90%", "20%")
}

export function mountTabs(root: HTMLElement): () => void {
    let active = tabs[0]!.id
    let items = tabs.map((tab) => ({ id: tab.id }))
    let nodes = new Map<Key, HTMLElement>()
    let tabBtns = new Map<string, HTMLButtonElement>()
    let raf = 0
    let settleTimer = 0

    let slide = createViewSlide({
        getMode: () => resolveViewSlideMode(getAnimationLevel(), "stack"),
        getDirection: (from, to) => slideDirectionByIndex(from, to, items),
        mountPolicy: "keep-visited",
    })

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "The pill and the panel stack share the same active key."

    let track = document.createElement("div")
    track.className = "pg-tabs-track"

    let pill = document.createElement("div")
    pill.className = "pg-tabs-pill"
    track.append(pill)

    for (let tab of tabs) {
        let btn = document.createElement("button")
        btn.type = "button"
        btn.className = "pg-tabs-tab"
        btn.textContent = tab.label
        if (tab.id === active) btn.classList.add("is-active")
        btn.addEventListener("click", () => select(tab.id))
        tabBtns.set(tab.id, btn)
        track.append(btn)
    }

    let viewport = document.createElement("div")
    viewport.className = "pg-slide-view"
    tester.append(hint, track, viewport)
    root.append(tester)

    let indicator = createSlidingIndicator({
        getTrack: () => track,
        getIndicator: () => pill,
        getActive: () => tabBtns.get(active) ?? null,
        enabled: () => canAnimate(getAnimationLevel()),
    })

    function paintPanel(el: HTMLElement, tab: Tab): void {
        let dark = document.documentElement.dataset.theme === "dark"
        el.style.background = `hsl(${dark ? darkTint(tab.tint) : tab.tint})`
        let title = document.createElement("h3")
        title.textContent = tab.title
        let body = document.createElement("p")
        body.textContent = tab.body
        el.append(title, body)
    }

    function syncPanels(): void {
        for (let key of slide.mountedKeys) {
            let node = nodes.get(key)
            if (!node) {
                let tab = tabs.find((item) => item.id === key)
                if (!tab) continue
                node = document.createElement("div")
                node.className = "pg-slide-panel"
                paintPanel(node, tab)
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
        settleTimer = window.setTimeout(() => syncPanels(), VIEW_SLIDE_MS + VIEW_SLIDE_SETTLE_SLACK_MS + 16)
    }

    function select(key: string): void {
        if (key === active) return
        active = key
        for (let [id, btn] of tabBtns) {
            btn.classList.toggle("is-active", id === active)
        }
        slide.setActive(key)
        syncPanels()
        watchSettle()
        indicator.measure()
    }

    slide.setActive(active)
    syncPanels()
    indicator.measure()

    return () => {
        cancelAnimationFrame(raf)
        window.clearTimeout(settleTimer)
        indicator.destroy()
        slide.destroy()
    }
}
