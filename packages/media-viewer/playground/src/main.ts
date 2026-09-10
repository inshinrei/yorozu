import { attachMediaViewer, captureOriginFromDom, createMediaViewer } from "@yorozu/media-viewer"
import "../../src/default.css"
import "./app.css"
import { loadMediaManifest, mountGallery } from "./gallery"

function boot(): void {
    let app = document.getElementById("app")
    if (!app) return

    let shell = document.createElement("div")
    shell.className = "pg-shell"

    let header = document.createElement("header")
    header.className = "pg-header"

    let title = document.createElement("h1")
    title.className = "pg-title"
    title.textContent = "Media viewer"

    let filmstripLabel = document.createElement("label")
    filmstripLabel.className = "pg-filmstrip"
    let filmstrip = document.createElement("input")
    filmstrip.type = "checkbox"
    filmstrip.checked = true
    let filmstripText = document.createElement("span")
    filmstripText.textContent = "Filmstrip"
    filmstripLabel.append(filmstrip, filmstripText)

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Click a cell. Esc closes."

    header.append(title, filmstripLabel, hint)

    let scroller = document.createElement("div")
    scroller.className = "pg-scroller"
    let gridHost = document.createElement("div")
    gridHost.className = "pg-grid"
    scroller.append(gridHost)

    shell.append(header, scroller)
    app.append(shell)

    let viewer = createMediaViewer()
    attachMediaViewer(viewer, document.body, {
        getHistoryClipRoot: () => scroller,
    })

    filmstrip.addEventListener("change", () => {
        viewer.setFilmstrip(filmstrip.checked)
    })

    void loadMediaManifest().then((manifest) => {
        mountGallery(gridHost, {
            images: manifest.images,
            videos: manifest.videos,
            onOpen: (items, index, id) => {
                viewer.open({
                    items,
                    index,
                    origin: captureOriginFromDom(id),
                    ghost: true,
                    filmstrip: filmstrip.checked,
                })
            },
        })
    })
}

boot()
