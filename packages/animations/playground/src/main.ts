import { catalog, type CatalogEntry } from "./catalog"
import { openOverlay } from "./overlay"
import "./tokens.css"
import "./app.css"

let THEME_KEY = "yorozu-animations-theme"

function readTheme(): "light" | "dark" {
    let stored = localStorage.getItem(THEME_KEY)
    if (stored === "dark" || stored === "light") return stored
    return "light"
}

function applyTheme(theme: "light" | "dark"): void {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
}

function matches(entry: CatalogEntry, query: string): boolean {
    let q = query.trim().toLowerCase()
    if (!q) return true
    if (entry.title.toLowerCase().includes(q)) return true
    if (entry.description.toLowerCase().includes(q)) return true
    return entry.tags.some((tag) => tag.toLowerCase().includes(q))
}

function renderGrid(host: HTMLElement, query: string): void {
    host.replaceChildren()
    let visible = catalog.filter((entry) => matches(entry, query))
    if (visible.length === 0) {
        let empty = document.createElement("p")
        empty.className = "pg-empty"
        empty.textContent = "No matching animations"
        host.append(empty)
        return
    }

    let grid = document.createElement("div")
    grid.className = "pg-grid"
    for (let entry of visible) {
        let card = document.createElement("button")
        card.type = "button"
        card.className = "pg-card"

        let title = document.createElement("div")
        title.className = "pg-card-title"
        title.textContent = entry.title

        let desc = document.createElement("div")
        desc.className = "pg-card-desc"
        desc.textContent = entry.description

        let tags = document.createElement("div")
        tags.className = "pg-tags"
        for (let tag of entry.tags) {
            let chip = document.createElement("span")
            chip.className = "pg-tag"
            chip.textContent = tag
            tags.append(chip)
        }

        card.append(title, desc, tags)
        card.addEventListener("click", () => openOverlay(entry.title, entry.mount))
        grid.append(card)
    }
    host.append(grid)
}

function boot(): void {
    let theme = readTheme()
    applyTheme(theme)

    let app = document.getElementById("app")
    if (!app) return

    let shell = document.createElement("div")
    shell.className = "pg-shell"

    let top = document.createElement("header")
    top.className = "pg-top"

    let heading = document.createElement("h1")
    heading.className = "pg-title"
    heading.textContent = "Animations"

    let search = document.createElement("input")
    search.type = "search"
    search.className = "pg-search"
    search.placeholder = "Search animations"
    search.setAttribute("aria-label", "Search animations")

    let themeBtn = document.createElement("button")
    themeBtn.type = "button"
    themeBtn.className = "pg-theme"

    function syncThemeLabel(): void {
        let current = document.documentElement.dataset.theme === "dark" ? "dark" : "light"
        themeBtn.textContent = current === "dark" ? "Light" : "Dark"
        themeBtn.setAttribute("aria-label", current === "dark" ? "Switch to light theme" : "Switch to dark theme")
    }

    themeBtn.addEventListener("click", () => {
        let current = document.documentElement.dataset.theme === "dark" ? "dark" : "light"
        applyTheme(current === "dark" ? "light" : "dark")
        syncThemeLabel()
    })
    syncThemeLabel()

    let wrap = document.createElement("main")
    wrap.className = "pg-grid-wrap"

    search.addEventListener("input", () => renderGrid(wrap, search.value))

    top.append(heading, search, themeBtn)
    shell.append(top, wrap)
    app.append(shell)
    renderGrid(wrap, "")
}

boot()
