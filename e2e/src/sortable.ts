import {
    HOLD_ACTIVATION,
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
const HOLD_KEYS: string[] = ["a", "b", "c", "d", "e", "f", "g", "h"]

type SortableHost = SortableSession | SortableBothAxis

const requireEl = (id: string): HTMLElement => {
    let el = document.querySelector(`#${id}`)
    if (!(el instanceof HTMLElement)) {
        throw new Error(`missing #${id}`)
    }
    return el
}

const mountWithReorder = (
    listId: string,
    orderId: string,
    makeSession: (
        getItems: () => string[],
        onReorder: (next: string[]) => void,
        nodes: Map<string, HTMLElement>,
    ) => { session: SortableHost; paint: () => void },
    keys: string[] = KEYS,
    preventDown: boolean = true,
): void => {
    let list = requireEl(listId)
    let order = requireEl(orderId)
    let items = keys.slice()
    let nodes = new Map<string, HTMLElement>()
    let handles: SortableItemHandle[] = []
    let host: { session: SortableHost; paint: () => void }

    const render = (): void => {
        for (let handle of handles) handle.destroy()
        handles = []
        nodes.clear()
        list.replaceChildren()
        for (let key of items) {
            let node = document.createElement("div")
            node.dataset.key = key
            node.tabIndex = 0
            node.textContent = key
            list.append(node)
            handles.push(host.session.registerItem(node, key))
            nodes.set(key, node)
            node.addEventListener("pointerdown", (event: PointerEvent) => {
                if (preventDown) event.preventDefault()
                host.session.pointerDown(key, event)
            })
        }
        order.textContent = items.join(",")
        host.paint()
    }

    host = makeSession(
        () => items,
        (next) => {
            items = next
            render()
        },
        nodes,
    )
    host.session.subscribe(host.paint)
    render()
}

mountWithReorder("list-y", "order-y", (getItems, onReorder, nodes) => {
    let session = createSortableSession({
        axis: "y",
        getItems,
        getKey: (item) => item,
        activation: POINTER_ACTIVATION,
        onReorder,
    })
    return {
        session,
        paint: () => {
            paintSortableTransforms(session, nodes)
        },
    }
})

mountWithReorder("list-x", "order-x", (getItems, onReorder, nodes) => {
    let session = createSortableSession({
        axis: "x",
        getItems,
        getKey: (item) => item,
        activation: POINTER_ACTIVATION,
        onReorder,
    })
    return {
        session,
        paint: () => {
            paintSortableTransforms(session, nodes)
        },
    }
})

mountWithReorder("list-both", "order-both", (getItems, onReorder, nodes) => {
    let session = createSortableBothAxis({
        getItems,
        getKey: (item) => item,
        activation: POINTER_ACTIVATION,
        onReorder,
    })
    return {
        session,
        paint: () => {
            paintSortableFlowTransforms(session, nodes)
        },
    }
})

mountWithReorder(
    "list-hold",
    "order-hold",
    (getItems, onReorder, nodes) => {
        let session = createSortableSession({
            axis: "x",
            getItems,
            getKey: (item) => item,
            activation: HOLD_ACTIVATION,
            onReorder,
        })
        return {
            session,
            paint: () => {
                paintSortableTransforms(session, nodes)
            },
        }
    },
    HOLD_KEYS,
    false,
)
