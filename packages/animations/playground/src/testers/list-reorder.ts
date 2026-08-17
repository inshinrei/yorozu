import { createListReorder, prefersReducedMotion } from "@yorozu/animations"

type Row = {
    id: string
    label: string
}

let ROW_H = 48

function seedRows(): Row[] {
    let rows: Row[] = []
    for (let i = 1; i <= 12; i++) {
        rows.push({ id: `row-${i}`, label: `Row ${i}` })
    }
    return rows
}

export function mountListReorder(root: HTMLElement): () => void {
    let items = seedRows()
    let insertCount = 0
    let rowEls = new Map<string, HTMLElement>()

    let reorder = createListReorder<Row>({
        getItemHeight: () => ROW_H,
        getKey: (item) => item.id,
        isReduced: () => prefersReducedMotion(),
    })

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let toolbar = document.createElement("div")
    toolbar.className = "pg-toolbar"

    let moveBtn = document.createElement("button")
    moveBtn.type = "button"
    moveBtn.className = "pg-btn pg-btn-primary"
    moveBtn.textContent = "Move last to top"

    let swapBtn = document.createElement("button")
    swapBtn.type = "button"
    swapBtn.className = "pg-btn"
    swapBtn.textContent = "Swap 2–3"

    let insertBtn = document.createElement("button")
    insertBtn.type = "button"
    insertBtn.className = "pg-btn"
    insertBtn.textContent = "Insert at 0"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Fixed-height rows. Order changes rewrite the list, then sync."

    let list = document.createElement("div")
    list.className = "pg-list"

    toolbar.append(moveBtn, swapBtn, insertBtn)
    tester.append(toolbar, hint, list)
    root.append(tester)

    function makeRow(item: Row): HTMLElement {
        let row = document.createElement("div")
        row.className = "pg-list-row"
        row.style.height = `${ROW_H}px`

        let index = document.createElement("span")
        index.className = "pg-list-index"

        let label = document.createElement("span")
        label.textContent = item.label

        row.append(index, label)
        reorder.register(row, item.id)
        return row
    }

    function paintIndices(): void {
        for (let i = 0; i < items.length; i++) {
            let row = rowEls.get(items[i]!.id)
            let badge = row?.querySelector(".pg-list-index")
            if (badge) badge.textContent = String(i + 1)
        }
    }

    function apply(next: Row[]): void {
        items = next
        for (let item of items) {
            let row = rowEls.get(item.id)
            if (!row) {
                row = makeRow(item)
                rowEls.set(item.id, row)
            }
            list.append(row)
        }
        paintIndices()
        reorder.sync(items)
    }

    apply(items)

    moveBtn.addEventListener("click", () => {
        if (items.length < 2) return
        let last = items[items.length - 1]!
        apply([last, ...items.slice(0, -1)])
    })

    swapBtn.addEventListener("click", () => {
        if (items.length < 3) return
        let next = items.slice()
        let a = next[1]!
        next[1] = next[2]!
        next[2] = a
        apply(next)
    })

    insertBtn.addEventListener("click", () => {
        insertCount += 1
        let item: Row = { id: `new-${insertCount}`, label: `Inserted ${insertCount}` }
        apply([item, ...items])
    })

    return () => {
        reorder.destroy()
    }
}
