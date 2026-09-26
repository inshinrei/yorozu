import "@yorozu/media-viewer/default.css"
import {
    attachMediaViewer,
    captureOriginFromDom,
    createMediaViewer,
    type MediaViewerChromeApi,
    type MediaViewerItem,
} from "@yorozu/media-viewer"

const IMG_SRC: string = "/media/img.jpg"
const GIF_SRC: string = "/media/loop.gif"
const VID_SRC: string = "/media/clip.mp4"

const items: MediaViewerItem[] = [
    ...Array.from({ length: 20 }, (_, i): MediaViewerItem => ({ id: `img-${i}`, kind: "image", src: IMG_SRC })),
    { id: "gif-0", kind: "gif", src: GIF_SRC },
    { id: "vid-0", kind: "video", src: VID_SRC },
]

const prefersReducedMotion = (): boolean => true

const paintHeader = (container: HTMLElement, api: MediaViewerChromeApi): (() => void) => {
    let bar = document.createElement("div")

    let close = document.createElement("button")
    close.type = "button"
    close.id = "chrome-close"
    close.textContent = "Close"
    close.addEventListener("click", () => {
        api.close()
    })

    let prev = document.createElement("button")
    prev.type = "button"
    prev.id = "chrome-prev"
    prev.textContent = "Prev"
    prev.addEventListener("click", () => {
        api.prev()
    })

    let next = document.createElement("button")
    next.type = "button"
    next.id = "chrome-next"
    next.textContent = "Next"
    next.addEventListener("click", () => {
        api.next()
    })

    let zoomIn = document.createElement("button")
    zoomIn.type = "button"
    zoomIn.id = "chrome-zoom-in"
    zoomIn.textContent = "Zoom in"
    zoomIn.addEventListener("click", () => {
        api.zoomIn()
    })

    let zoomOut = document.createElement("button")
    zoomOut.type = "button"
    zoomOut.id = "chrome-zoom-out"
    zoomOut.textContent = "Zoom out"
    zoomOut.addEventListener("click", () => {
        api.zoomOut()
    })

    let reset = document.createElement("button")
    reset.type = "button"
    reset.id = "chrome-zoom-reset"
    reset.textContent = "Reset"
    reset.addEventListener("click", () => {
        api.resetZoom()
    })

    let percent = document.createElement("span")
    percent.id = "chrome-percent"
    percent.textContent = api.percentLabel()

    let search = document.createElement("input")
    search.id = "chrome-search"
    search.type = "text"

    bar.append(close, prev, next, zoomIn, zoomOut, reset, percent, search)
    container.append(bar)

    return api.onZoomChange(() => {
        percent.textContent = api.percentLabel()
    })
}

let viewer = createMediaViewer({ prefersReducedMotion })
attachMediaViewer(viewer, document.body, { prefersReducedMotion })

let gallery = document.querySelector("#gallery")
if (!(gallery instanceof HTMLElement)) {
    throw new Error("missing #gallery")
}

for (let item of items) {
    let btn = document.createElement("button")
    btn.type = "button"
    btn.setAttribute("data-id", item.id)
    btn.setAttribute("data-yorozu-media-origin", item.id)
    let img = document.createElement("img")
    img.src = item.kind === "gif" ? GIF_SRC : IMG_SRC
    img.alt = ""
    btn.append(img)
    gallery.append(btn)
}

gallery.addEventListener("click", (event: MouseEvent) => {
    let t = event.target
    if (!(t instanceof Element)) return
    let btn = t.closest("[data-id]")
    if (!(btn instanceof HTMLElement)) return
    let id = btn.getAttribute("data-id")
    if (!id) return
    let index = items.findIndex((item) => item.id === id)
    if (index < 0) return
    viewer.open({
        items,
        index,
        origin: captureOriginFromDom(id, { attr: "data-yorozu-media-origin" }),
        ghost: false,
        filmstrip: true,
        chrome: { header: paintHeader },
    })
})
