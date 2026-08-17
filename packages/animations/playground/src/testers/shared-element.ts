import { createSharedElement, type SharedElementSeed } from "@yorozu/animations"

type Cover = {
    id: string
    label: string
    hue: number
}

let covers: Cover[] = [
    { id: "c1", label: "One", hue: 210 },
    { id: "c2", label: "Two", hue: 265 },
    { id: "c3", label: "Three", hue: 16 },
    { id: "c4", label: "Four", hue: 150 },
    { id: "c5", label: "Five", hue: 330 },
    { id: "c6", label: "Six", hue: 45 },
]

function coverUrl(cover: Cover): string {
    let svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">` +
        `<rect width="100%" height="100%" fill="hsl(${cover.hue} 54% 44%)"/>` +
        `<circle cx="72%" cy="32%" r="150" fill="hsl(${cover.hue} 58% 58%)"/>` +
        `<rect x="0" y="480" width="800" height="120" fill="hsl(${cover.hue} 40% 22% / 0.35)"/>` +
        `<text x="40" y="555" fill="white" font-size="52" font-family="sans-serif">${cover.label}</text>` +
        `</svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function rectOf(el: Element): DOMRect {
    return el.getBoundingClientRect()
}

export function mountSharedElement(root: HTMLElement): () => void {
    let se = createSharedElement()
    let openThumb: HTMLImageElement | null = null
    let openUrl = ""

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Click a cover to fly it into the stage. Click the stage or press Esc to reverse."

    let frame = document.createElement("div")
    frame.className = "pg-se"

    let grid = document.createElement("div")
    grid.className = "pg-se-grid"

    for (let cover of covers) {
        let url = coverUrl(cover)
        let img = document.createElement("img")
        img.className = "pg-se-thumb"
        img.src = url
        img.alt = cover.label
        img.decoding = "async"
        img.addEventListener("click", () => openFrom(img, url))
        grid.append(img)
    }

    let stage = document.createElement("div")
    stage.className = "pg-se-stage"
    stage.setAttribute("role", "button")
    stage.tabIndex = 0

    let media = document.createElement("img")
    media.className = "pg-se-media"
    media.alt = ""
    stage.append(media)
    frame.append(grid, stage)
    tester.append(hint, frame)
    root.append(tester)

    function seedFor(thumb: HTMLImageElement, imageUrl: string): SharedElementSeed {
        return {
            rect: rectOf(thumb),
            imageUrl,
            objectFit: "cover",
            naturalWidth: 800,
            naturalHeight: 600,
        }
    }

    function openFrom(thumb: HTMLImageElement, imageUrl: string): void {
        if (stage.classList.contains("is-open")) return
        openThumb = thumb
        openUrl = imageUrl
        media.src = imageUrl
        stage.classList.add("is-open")
        thumb.style.visibility = "hidden"

        let playback = se.playOpen({
            host: document.body,
            seed: seedFor(thumb, imageUrl),
            to: rectOf(media),
            hideTarget: media,
        })
        if (!playback) media.style.visibility = ""
    }

    function closeStage(): void {
        if (!stage.classList.contains("is-open")) return
        let thumb = openThumb
        let imageUrl = openUrl
        let fromStage = rectOf(media)

        let finish = (): void => {
            stage.classList.remove("is-open")
            media.removeAttribute("src")
            media.style.visibility = ""
            if (thumb) thumb.style.visibility = ""
            openThumb = null
            openUrl = ""
        }

        media.style.visibility = "hidden"
        let playback = se.playClose({
            host: document.body,
            fromStage,
            target: thumb ? seedFor(thumb, imageUrl) : null,
            imageUrl,
        })
        // playClose cancel() restores hideTarget from the interrupted open; keep media covered.
        media.style.visibility = "hidden"
        if (!playback) {
            finish()
            return
        }
        void playback.done.then(() => finish())
    }

    function onStageActivate(event: Event): void {
        event.preventDefault()
        closeStage()
    }

    function onKey(event: KeyboardEvent): void {
        if (event.key !== "Escape") return
        if (!stage.classList.contains("is-open")) return
        if (event.target instanceof HTMLInputElement) return
        event.stopPropagation()
        closeStage()
    }

    stage.addEventListener("click", onStageActivate)
    stage.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") onStageActivate(event)
    })
    document.addEventListener("keydown", onKey, true)

    return () => {
        document.removeEventListener("keydown", onKey, true)
        se.cancel()
        if (openThumb) openThumb.style.visibility = ""
    }
}
