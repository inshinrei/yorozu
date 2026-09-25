import {
    POINTER_ACTIVATION,
    createSortableBothAxis,
    createSortableSession,
    paintSortableFlowTransforms,
    paintSortableTransforms,
    type SortableBothAxis,
    type SortableItemHandle,
    type SortableSession,
} from "@yorozu/sortable"

const KEYS: string[] = ["a", "b", "c", "d"]

const requireEl = (id: string): HTMLElement => {
    let el = document.querySelector(`#${id}`)
    if (!(el instanceof HTMLElement)) {
        throw new Error(`missing #${id}`)
    }
    return el
}

const mount1d = (listId: string, orderId: string, axis: "x" | "y"): void => {
    let list = requireEl(listId)
    let order = requireEl(orderId)
    let items = KEYS.slice()
    let nodes = new Map<string, HTMLElement>()
    let handles: SortableItemHandle[] = []

    let session: SortableSession = createSortableSession({
        axis,
        getItems: () => items,
        getKey: (item) => item,
        activation: POINTER_ACTIVATION,
        onReorder: (next) => {
            items = next
            render()
        },
    })

    const paint = (): void => {
        paintSortableTransforms(session, nodes)
    }

    session.subscribe(paint)

    const render = (): void => {
        for (let handle of handles) handle.destroy()
        handles = []
        nodes.clear()
        list.replaceChildren()
        for (let key of items) {
            let node = document.createElement("div")
            node.dataset.key = key
            node.textContent = key
            list.append(node)
            handles.push(session.registerItem(node, key))
            nodes.set(key, node)
            node.addEventListener("pointerdown", (event: PointerEvent) => {
                event.preventDefault()
                session.pointerDown(key, event)
            })
        }
        order.textContent = items.join(",")
        paint()
    }

    render()
}

const mountBoth = (listId: string, orderId: string): void => {
    let list = requireEl(listId)
    let order = requireEl(orderId)
    let items = KEYS.slice()
    let nodes = new Map<string, HTMLElement>()
    let handles: SortableItemHandle[] = []

    let session: SortableBothAxis = createSortableBothAxis({
        getItems: () => items,
        getKey: (item) => item,
        activation: POINTER_ACTIVATION,
        onReorder: (next) => {
            items = next
            render()
        },
    })

    const paint = (): void => {
        paintSortableFlowTransforms(session, nodes)
    }

    session.subscribe(paint)

    const render = (): void => {
        for (let handle of handles) handle.destroy()
        handles = []
        nodes.clear()
        list.replaceChildren()
        for (let key of items) {
            let node = document.createElement("div")
            node.dataset.key = key
            node.textContent = key
            list.append(node)
            handles.push(session.registerItem(node, key))
            nodes.set(key, node)
            node.addEventListener("pointerdown", (event: PointerEvent) => {
                event.preventDefault()
                session.pointerDown(key, event)
            })
        }
        order.textContent = items.join(",")
        paint()
    }

    render()
}

mount1d("list-y", "order-y", "y")
mount1d("list-x", "order-x", "x")
mountBoth("list-both", "order-both")
