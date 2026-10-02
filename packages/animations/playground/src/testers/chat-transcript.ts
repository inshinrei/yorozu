import {
    canAnimateFull,
    createHeavyAnimationLock,
    createLayoutGrow,
    createListShift,
    playPresencePop,
    playSendFlight,
    type AttachHandle,
    type Playback,
    type Rect,
} from "@yorozu/animations"
import { getAnimationLevel } from "../level"

function rectOf(el: Element): Rect {
    let box = el.getBoundingClientRect()
    return { top: box.top, left: box.left, width: box.width, height: box.height }
}

function makeBtn(label: string, primary = false): HTMLButtonElement {
    let el = document.createElement("button")
    el.type = "button"
    el.className = primary ? "pg-btn pg-btn-primary" : "pg-btn"
    el.textContent = label
    return el
}

export function mountChatTranscript(root: HTMLElement): () => void {
    let alive = true
    let note = 0
    let photo = 0
    let nextKey = 0
    let handles = new Map<HTMLElement, AttachHandle>()
    let busy = new WeakSet<HTMLElement>()
    let sendPlayback: Playback | null = null
    let shelf: HTMLElement | null = null

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let toolbar = document.createElement("div")
    toolbar.className = "pg-toolbar"

    let incoming = makeBtn("Incoming")

    let chat = document.createElement("div")
    chat.className = "pg-chat"

    let header = document.createElement("header")
    header.className = "pg-chat-header"
    header.textContent = "Chat"

    let scroller = document.createElement("div")
    scroller.className = "pg-chat-scroller"

    let composer = document.createElement("div")
    composer.className = "pg-chat-composer"

    let textarea = document.createElement("textarea")
    textarea.className = "pg-chat-input"
    textarea.rows = 1

    let bar = document.createElement("div")
    bar.className = "pg-chat-composer-bar"

    let attach = makeBtn("Attach")
    let send = makeBtn("Send", true)

    bar.append(attach, send)
    composer.append(textarea, bar)
    chat.append(header, scroller, composer)
    toolbar.append(incoming)
    tester.append(toolbar, chat)
    root.append(tester)

    let lock = createHeavyAnimationLock()
    let shift = createListShift({
        root: scroller,
        isEnabled: () => canAnimateFull(getAnimationLevel()),
        lock,
    })
    let grow = createLayoutGrow({
        el: composer,
        isEnabled: () => canAnimateFull(getAnimationLevel()),
        lock,
        onDelta: (deltaPx) => {
            let clientHeightBefore = scroller.clientHeight + deltaPx
            if (scroller.scrollTop + clientHeightBefore >= scroller.scrollHeight - 2) {
                scroller.scrollTop += deltaPx
            }
        },
    })

    function registerRow(row: HTMLElement): void {
        nextKey += 1
        handles.set(row, shift.register(row, nextKey))
    }

    function unmountRow(row: HTMLElement): void {
        handles.get(row)?.destroy()
        handles.delete(row)
        row.remove()
    }

    function dropChip(chip: HTMLElement): void {
        chip.remove()
        if (shelf && shelf.childElementCount === 0) {
            shelf.remove()
            shelf = null
        }
    }

    function fitTextarea(): void {
        textarea.style.height = "auto"
        textarea.style.height = `${textarea.scrollHeight}px`
    }

    function makeRow(text: string, kind: "self" | "peer"): HTMLElement {
        let row = document.createElement("div")
        row.className = `pg-chat-row ${kind}`

        let body = document.createElement("div")
        body.className = "pg-chat-body"

        let line = document.createElement("div")
        line.textContent = text
        body.append(line)

        let tools = document.createElement("div")
        tools.className = "pg-chat-tools"

        let edit = makeBtn("Edit")
        let react = makeBtn("React")
        let del = makeBtn("Delete")

        edit.addEventListener("click", () => {
            let extra = body.querySelector(".pg-chat-extra")
            if (extra) {
                extra.remove()
                return
            }
            extra = document.createElement("div")
            extra.className = "pg-chat-extra"
            extra.textContent = text
            body.append(extra)
        })

        react.addEventListener("click", () => {
            let pill = body.querySelector(".pg-chat-pill")
            if (pill) {
                pill.remove()
                return
            }
            pill = document.createElement("span")
            pill.className = "pg-chat-pill"
            pill.textContent = "❤"
            body.append(pill)
        })

        del.addEventListener("click", () => {
            if (!alive || busy.has(row) || !handles.has(row)) return
            busy.add(row)
            shift.snapshot()
            if (canAnimateFull(getAnimationLevel())) {
                let playback = playPresencePop(row, { direction: "out" })
                void playback.done.then(() => {
                    if (!alive || !row.isConnected) return
                    unmountRow(row)
                    shift.play()
                })
                return
            }
            unmountRow(row)
            shift.play()
        })

        tools.append(edit, react, del)
        row.append(body, tools)
        return row
    }

    for (let i = 0; i < 3; i++) {
        note += 1
        scroller.append(makeRow(`Note ${note}`, "self"))
    }
    scroller.scrollTop = scroller.scrollHeight
    for (let child of [...scroller.children]) {
        registerRow(child as HTMLElement)
    }

    textarea.addEventListener("input", () => fitTextarea())

    attach.addEventListener("click", () => {
        photo += 1
        if (!shelf) {
            shelf = document.createElement("div")
            shelf.className = "pg-chat-shelf"
            composer.insertBefore(shelf, textarea)
        }
        let chip = document.createElement("button")
        chip.type = "button"
        chip.className = "pg-chat-chip"
        chip.textContent = `Photo ${photo}`
        shelf.append(chip)
        if (canAnimateFull(getAnimationLevel())) playPresencePop(chip)
        chip.addEventListener("click", () => {
            if (!alive || busy.has(chip)) return
            busy.add(chip)
            if (canAnimateFull(getAnimationLevel())) {
                let playback = playPresencePop(chip, { direction: "out" })
                void playback.done.then(() => {
                    if (!alive) return
                    dropChip(chip)
                })
                return
            }
            dropChip(chip)
        })
    })

    send.addEventListener("click", () => {
        let text = textarea.value.trim()
        if (!text || !alive) return
        shift.snapshot()
        let from = rectOf(textarea)
        let seedEl = document.createElement("span")
        seedEl.className = "pg-chat-seed"
        seedEl.textContent = text
        let row = makeRow(text, "self")
        scroller.append(row)
        registerRow(row)
        row.style.opacity = "0"
        scroller.scrollTop = scroller.scrollHeight
        let to = rectOf(row)
        if (canAnimateFull(getAnimationLevel())) {
            sendPlayback?.cancel()
            sendPlayback = playSendFlight({ host: document.body, from, to, node: seedEl })
            let playback = sendPlayback
            if (playback) {
                void playback.done.then(() => {
                    if (!alive) return
                    if (sendPlayback === playback) sendPlayback = null
                    row.style.opacity = "1"
                })
            } else {
                row.style.opacity = "1"
            }
        } else {
            row.style.opacity = "1"
        }
        textarea.value = ""
        fitTextarea()
        shift.play()
    })

    incoming.addEventListener("click", () => {
        if (!alive) return
        note += 1
        shift.snapshot()
        let row = makeRow(`Note ${note}`, "peer")
        scroller.append(row)
        registerRow(row)
        scroller.scrollTop = scroller.scrollHeight
        shift.play()
    })

    return () => {
        alive = false
        sendPlayback?.cancel()
        sendPlayback = null
        grow.destroy()
        shift.destroy()
    }
}
