import { createOverscrollBounce } from "@yorozu/animations"
import { createVirtualList, type VirtualList } from "@yorozu/virtual-list"

const N: number = 500
const ITEM_SIZE: number = 48
const VIEWPORT_HEIGHT: number = 480
const JUMP_INDEX: number = 80

const items: string[] = Array.from({ length: N }, (_, i) => `row-${i}`)

const requireEl = (id: string): HTMLElement => {
    let el = document.querySelector(`#${id}`)
    if (!(el instanceof HTMLElement)) {
        throw new Error(`missing #${id}`)
    }
    return el
}

let scroller = requireEl("scroller")
let sizer = requireEl("sizer")
let jump80 = requireEl("jump-80")
let reanchor80 = requireEl("reanchor-80")
let scrollTo80 = requireEl("scroll-to-80")
let rowNodes = new Map<string, HTMLElement>()

let list: VirtualList<string> = createVirtualList({
    getItems: () => items,
    itemSize: ITEM_SIZE,
    onChange: () => {
        paint()
    },
})

createOverscrollBounce(scroller, sizer)

const paint = (): void => {
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
}

list.sync()

scroller.addEventListener("scroll", () => {
    list.onScroll({
        scrollTop: scroller.scrollTop,
        viewportHeight: VIEWPORT_HEIGHT,
    })
    paint()
})

jump80.addEventListener("click", () => {
    scroller.scrollTop = JUMP_INDEX * ITEM_SIZE
})

reanchor80.addEventListener("click", () => {
    list.reanchor(JUMP_INDEX)
    scroller.scrollTop = JUMP_INDEX * ITEM_SIZE
})

scrollTo80.addEventListener("click", () => {
    scroller.scrollTop = list.scrollToIndex(JUMP_INDEX)
})
