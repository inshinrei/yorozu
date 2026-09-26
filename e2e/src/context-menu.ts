import "@yorozu/context-menu/default.css"
import {
    bindLongPress,
    createMenuSession,
    createSubmenuHover,
    createSubmenuOpenRegistry,
    moveMenuFocus,
    type MenuSession,
    type SubmenuAnchor,
    type SubmenuHover,
} from "@yorozu/context-menu"

let session: MenuSession | undefined
let menuEl: HTMLElement | undefined
let subSession: MenuSession | undefined
let subMenuEl: HTMLElement | undefined
let submenuHover: SubmenuHover | undefined
let subCloser: (() => void) | undefined

const submenuRegistry = createSubmenuOpenRegistry()

const getDurationMs = (): number => 0

const closeSubmenu = (): void => {
    submenuHover?.clear()
    if (subCloser != null) {
        submenuRegistry.unregister(subCloser)
        subCloser = undefined
    }
    let current = subSession
    let el = subMenuEl
    subSession = undefined
    subMenuEl = undefined
    current?.destroy()
    el?.remove()
}

const destroyRoot = (): void => {
    closeSubmenu()
    let current = session
    let el = menuEl
    session = undefined
    menuEl = undefined
    submenuHover = undefined
    current?.destroy()
    el?.remove()
}

const openSubmenu = (anchor: SubmenuAnchor): void => {
    if (subSession != null && subMenuEl != null) {
        subSession.placePointer(anchor)
        return
    }

    let menu = document.createElement("div")
    menu.setAttribute("data-yorozu-menu", "")
    menu.setAttribute("data-menu", "sub")
    menu.tabIndex = -1

    let item = document.createElement("div")
    item.setAttribute("role", "menuitem")
    item.tabIndex = 0
    item.textContent = "Sub action"
    menu.append(item)
    document.body.append(menu)
    subMenuEl = menu

    menu.addEventListener("pointerenter", () => {
        submenuHover?.cancelClose()
    })
    menu.addEventListener("pointerleave", () => {
        submenuHover?.scheduleClose()
    })

    subCloser = () => {
        subSession?.close()
    }
    subSession = createMenuSession({
        nested: true,
        listenEsc: false,
        getDurationMs,
        onClose: closeSubmenu,
    })
    subSession.attach(menu)
    subSession.placePointer(anchor)
    submenuRegistry.registerOpen(subCloser)
}

const paintRootMenu = (): HTMLElement => {
    let menu = document.createElement("div")
    menu.setAttribute("data-yorozu-menu", "")
    menu.tabIndex = -1

    let stay = document.createElement("div")
    stay.id = "item-stay"
    stay.setAttribute("role", "menuitem")
    stay.tabIndex = 0
    stay.textContent = "Stay"

    let disabled = document.createElement("div")
    disabled.id = "item-disabled"
    disabled.setAttribute("role", "menuitem")
    disabled.setAttribute("aria-disabled", "true")
    disabled.className = "disabled"
    disabled.textContent = "Disabled"

    let closeItem = document.createElement("div")
    closeItem.id = "item-close"
    closeItem.setAttribute("role", "menuitem")
    closeItem.tabIndex = 0
    closeItem.textContent = "Close"
    closeItem.addEventListener("click", () => {
        session?.close()
    })

    let sub = document.createElement("div")
    sub.id = "item-sub"
    sub.setAttribute("role", "menuitem")
    sub.tabIndex = 0
    sub.textContent = "More"
    sub.addEventListener("pointerenter", () => {
        submenuHover?.scheduleOpen()
    })
    sub.addEventListener("pointerleave", () => {
        submenuHover?.scheduleClose()
    })
    sub.addEventListener("click", () => {
        submenuHover?.openFromClick()
    })

    menu.append(stay, disabled, closeItem, sub)
    document.body.append(menu)
    return menu
}

const openRoot = (anchor: { x: number; y: number }): void => {
    if (session != null) return

    menuEl = paintRootMenu()
    submenuHover = createSubmenuHover({
        getRect: () => {
            let item = document.querySelector("#item-sub")
            if (!(item instanceof HTMLElement)) return undefined
            let rect = item.getBoundingClientRect()
            return { right: rect.right, top: rect.top }
        },
        isOpen: () => subMenuEl != null,
        setOpen: (next: SubmenuAnchor | null) => {
            if (next == null) {
                closeSubmenu()
                return
            }
            openSubmenu(next)
        },
    })
    let omitListenEsc = new URLSearchParams(window.location.search).get("esc") === "0"
    session = createMenuSession({
        onClose: destroyRoot,
        getDurationMs,
        ...(omitListenEsc ? { listenEsc: false } : {}),
    })
    session.attach(menuEl)
    session.placePointer(anchor)
}

let target = document.querySelector("#menu-target")
if (!(target instanceof HTMLElement)) {
    throw new Error("missing #menu-target")
}

const bindTarget = (node: HTMLElement): void => {
    bindLongPress(node)
    node.addEventListener("contextmenu", (event: MouseEvent) => {
        event.preventDefault()
        openRoot({ x: event.clientX, y: event.clientY })
    })
}

bindTarget(target)

let corner = document.querySelector("#menu-target-corner")
if (corner instanceof HTMLElement) bindTarget(corner)

document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (session == null || menuEl == null) return
    if (event.key === "ArrowDown") {
        event.preventDefault()
        moveMenuFocus(menuEl, 1)
        return
    }
    if (event.key === "ArrowUp") {
        event.preventDefault()
        moveMenuFocus(menuEl, -1)
    }
})
