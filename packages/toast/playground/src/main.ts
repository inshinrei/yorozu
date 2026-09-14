import { attachToastRoot, createToastSession, type ToastPlacement, type ToastSession } from "@yorozu/toast"
import "../../src/default.css"
import "./app.css"
import { getAnimationLevel } from "./level"
import { mountLevelSwitch } from "./level-switch"

let PLACEMENTS: ToastPlacement[] = [
    "top-left",
    "top-center",
    "top-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
]

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

    let n = 0
    let placement: ToastPlacement = "bottom-left"
    let session: ToastSession = createToastSession({ placement })
    let toastRoot = document.createElement("div")
    document.body.append(toastRoot)
    let stop = attachToastRoot(session, toastRoot, {
        prefersReducedMotion: () => getAnimationLevel() === "low",
    })

    function recreate(next: ToastPlacement): void {
        placement = next
        session.destroy()
        stop()
        session = createToastSession({ placement })
        stop = attachToastRoot(session, toastRoot, {
            prefersReducedMotion: () => getAnimationLevel() === "low",
        })
    }

    let shell = document.createElement("div")
    shell.className = "pg-shell"

    let header = document.createElement("header")
    header.className = "pg-header"

    let title = document.createElement("h1")
    title.className = "pg-title"
    title.textContent = "Toast"

    let levelHost = document.createElement("div")
    levelHost.className = "pg-level-host"
    mountLevelSwitch(levelHost)

    let placementSelect = document.createElement("select")
    placementSelect.className = "pg-select"
    placementSelect.setAttribute("aria-label", "Placement")
    for (let value of PLACEMENTS) {
        let option = document.createElement("option")
        option.value = value
        option.textContent = value
        if (value === placement) option.selected = true
        placementSelect.append(option)
    }
    placementSelect.addEventListener("change", () => {
        let next = PLACEMENTS.find((value) => value === placementSelect.value)
        if (next) recreate(next)
    })

    let actions = document.createElement("div")
    actions.className = "pg-actions"
    actions.append(
        button("Show toast", () => {
            n += 1
            session.show("Saved " + n)
        }),
        button("Show permanent", () => {
            n += 1
            session.show("Syncing " + n, { permanent: true })
        }),
        button("Show 6 timed", () => {
            for (let i = 0; i < 6; i++) {
                n += 1
                session.show("Saved " + n)
            }
        }),
        button("Dismiss oldest permanent", () => {
            let oldest = session.toasts().find((t) => t.permanent && !t.exiting)
            if (oldest) session.dismiss(oldest.id)
        }),
    )

    header.append(title, levelHost, placementSelect, actions)
    shell.append(header)
    app.append(shell)
}

boot()
