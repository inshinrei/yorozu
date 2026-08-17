import { createSlidingIndicator, prefersReducedMotion } from "@yorozu/animations"

let shortLabels = ["A", "Medium", "Longer label", "Wide section title", "B"]
let tallLabels = ["Alpha item", "Med", "Label three is much longer now", "Wide", "Beta extra"]

export function mountSlidingIndicator(root: HTMLElement): () => void {
    let tall = false
    let activeIndex = 0
    let tabs: HTMLButtonElement[] = []

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let toolbar = document.createElement("div")
    toolbar.className = "pg-toolbar"

    let resizeBtn = document.createElement("button")
    resizeBtn.type = "button"
    resizeBtn.className = "pg-btn pg-btn-primary"
    resizeBtn.textContent = "resize labels"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Click a tab to move the pill. Width snaps; only position tweens."

    let track = document.createElement("div")
    track.className = "pg-ind-track"

    let pill = document.createElement("div")
    pill.className = "pg-ind-pill"
    track.append(pill)

    function makeTabs(): void {
        for (let tab of tabs) tab.remove()
        tabs = shortLabels.map((label, index) => {
            let tab = document.createElement("button")
            tab.type = "button"
            tab.className = "pg-ind-tab"
            tab.textContent = label
            if (index === activeIndex) tab.classList.add("is-active")
            tab.addEventListener("click", () => select(index))
            track.append(tab)
            return tab
        })
    }

    makeTabs()
    toolbar.append(resizeBtn)
    tester.append(toolbar, hint, track)
    root.append(tester)

    let indicator = createSlidingIndicator({
        getTrack: () => track,
        getIndicator: () => pill,
        getActive: () => tabs[activeIndex] ?? null,
        enabled: () => !prefersReducedMotion(),
    })

    function select(index: number): void {
        activeIndex = index
        for (let i = 0; i < tabs.length; i++) {
            tabs[i]!.classList.toggle("is-active", i === activeIndex)
        }
        indicator.measure()
    }

    resizeBtn.addEventListener("click", () => {
        tall = !tall
        let next = tall ? tallLabels : shortLabels
        for (let i = 0; i < tabs.length; i++) {
            tabs[i]!.textContent = next[i] ?? ""
        }
        indicator.measure()
    })

    indicator.measure()

    return () => {
        indicator.destroy()
    }
}
