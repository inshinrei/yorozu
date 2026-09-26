import { createOverscrollBounce } from "@yorozu/animations"
import { createVirtualList } from "@yorozu/virtual-list"
import "./app.css"

function button(label: string, onClick: () => void): HTMLButtonElement {
    let el = document.createElement("button")
    el.type = "button"
    el.className = "pg-btn"
    el.textContent = label
    el.addEventListener("click", onClick)
    return el
}

function boot(): void {
    let app = document.getElementById("app")
    if (!app) return

    let items = Array.from({ length: 500 }, (_, i) => `row-${i}`)
    let rowNodes = new Map<string, HTMLElement>()

    let shell = document.createElement("div")
    shell.className = "pg-shell"

    let header = document.createElement("header")
    header.className = "pg-header"

    let title = document.createElement("h1")
    title.className = "pg-title"
    title.textContent = "Virtual list"

    let readout = document.createElement("span")
    readout.id = "readout"

    let actions = document.createElement("div")
    actions.className = "pg-actions"

    let main = document.createElement("div")
    main.className = "pg-main"

    let scroller = document.createElement("div")
    scroller.id = "scroller"
    scroller.tabIndex = 0

    let sizer = document.createElement("div")
    sizer.id = "sizer"
    scroller.append(sizer)
    main.append(scroller)

    header.append(title, actions, readout)
    shell.append(header, main)
    app.append(shell)

    function updateReadout(): void {
        readout.textContent = `overscroll=${sizer.dataset.yorozuOverscroll} scrollTop=${scroller.scrollTop}`
    }

    function paint(): void {
        sizer.style.height = `${list.totalSize()}px`
        let from = list.fromOffset()
        let ids = list.viewportIds() ?? []
        let keep = new Set(ids)
        for (let [id] of [...rowNodes.entries()]) {
            if (keep.has(id)) continue
            rowNodes.delete(id)
        }
        let next: HTMLElement[] = []
        for (let i = 0; i < ids.length; i++) {
            let id = ids[i]!
            let index = from + i
            let node = rowNodes.get(id)
            if (node === undefined) {
                node = document.createElement("div")
                node.dataset.id = id
                node.textContent = id
                rowNodes.set(id, node)
            }
            node.dataset.index = String(index)
            node.style.top = `${list.rowTop(index)}px`
            next.push(node)
        }
        sizer.replaceChildren(...next)
        updateReadout()
    }

    let list = createVirtualList({
        getItems: () => items,
        itemSize: 48,
        onChange: paint,
    })
    let bounce = createOverscrollBounce(scroller, sizer)

    actions.append(
        button("Long (500)", () => {
            items = Array.from({ length: 500 }, (_, i) => `row-${i}`)
            list.sync()
            paint()
        }),
        button("Short (5)", () => {
            items = Array.from({ length: 5 }, (_, i) => `row-${i}`)
            list.sync()
            scroller.scrollTop = 0
            paint()
        }),
        button("Jump 80", () => {
            scroller.scrollTop = 80 * 48
        }),
        button("Reanchor 80", () => {
            list.reanchor(80)
            scroller.scrollTop = 80 * 48
        }),
    )

    list.sync()
    paint()

    scroller.addEventListener("scroll", () => {
        list.onScroll({
            scrollTop: scroller.scrollTop,
            viewportHeight: scroller.clientHeight,
        })
        paint()
        updateReadout()
    })

    let overscrollWatch = new MutationObserver(updateReadout)
    overscrollWatch.observe(sizer, { attributes: true, attributeFilter: ["data-yorozu-overscroll"] })

    if (import.meta.hot) {
        import.meta.hot.dispose(() => {
            overscrollWatch.disconnect()
            list.destroy()
            bounce.destroy()
            app.replaceChildren()
        })
    }
}

boot()
