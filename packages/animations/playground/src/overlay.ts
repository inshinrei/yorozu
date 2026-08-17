type OverlayState = {
    root: HTMLElement
    unmount: () => void
    onKey: (event: KeyboardEvent) => void
}

let state: OverlayState | null = null

function isInputTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== "Escape") return
    if (isInputTarget(event.target)) return
    closeOverlay()
}

export function closeOverlay(): void {
    if (!state) return
    document.removeEventListener("keydown", state.onKey)
    state.unmount()
    state.root.remove()
    state = null
}

export function openOverlay(title: string, mount: (root: HTMLElement) => () => void): void {
    closeOverlay()

    let root = document.createElement("div")
    root.className = "pg-overlay"

    let scrim = document.createElement("div")
    scrim.className = "pg-overlay-scrim"
    scrim.addEventListener("click", () => closeOverlay())

    let panel = document.createElement("div")
    panel.className = "pg-overlay-panel"
    panel.setAttribute("role", "dialog")
    panel.setAttribute("aria-modal", "true")

    let header = document.createElement("header")
    header.className = "pg-overlay-header"

    let heading = document.createElement("h2")
    heading.className = "pg-overlay-title"
    heading.textContent = title
    panel.setAttribute("aria-labelledby", "pg-overlay-title")
    heading.id = "pg-overlay-title"

    let closeBtn = document.createElement("button")
    closeBtn.type = "button"
    closeBtn.className = "pg-overlay-close"
    closeBtn.setAttribute("aria-label", "Close")
    closeBtn.textContent = "×"
    closeBtn.addEventListener("click", () => closeOverlay())

    let body = document.createElement("div")
    body.className = "pg-overlay-body"

    header.append(heading, closeBtn)
    panel.append(header, body)
    root.append(scrim, panel)
    document.body.append(root)

    let unmount = mount(body)
    state = { root, unmount, onKey }
    document.addEventListener("keydown", onKey)
}
