export const MENU_SUBMENU_DELAY_MS: number = 150

export type SubmenuOpenRegistry = {
    registerOpen: (closeFn: () => void) => void
    unregister: (closeFn: () => void) => void
}

export function createSubmenuOpenRegistry(): SubmenuOpenRegistry {
    let current: (() => void) | null = null
    return {
        registerOpen(closeFn: () => void): void {
            if (current === closeFn) return
            current?.()
            current = closeFn
        },
        unregister(closeFn: () => void): void {
            if (current === closeFn) current = null
        },
    }
}

export type SubmenuAnchor = { x: number; y: number }

export type SubmenuHover = {
    open: () => void
    openFromClick: () => void
    close: () => void
    scheduleOpen: () => void
    scheduleClose: () => void
    cancelClose: () => void
    clear: () => void
}

export function createSubmenuHover(opts: {
    getRect: () => { right: number; top: number } | undefined
    isOpen: () => boolean
    setOpen: (next: SubmenuAnchor | null) => void
}): SubmenuHover {
    let openTimer: ReturnType<typeof setTimeout> | undefined
    let closeTimer: ReturnType<typeof setTimeout> | undefined
    let stickyUntilEnter = false

    function clearOpenTimer(): void {
        if (openTimer != null) {
            clearTimeout(openTimer)
            openTimer = undefined
        }
    }

    function clearCloseTimer(): void {
        if (closeTimer != null) {
            clearTimeout(closeTimer)
            closeTimer = undefined
        }
    }

    function open(): void {
        let rect = opts.getRect()
        if (rect == null) return
        clearOpenTimer()
        clearCloseTimer()
        opts.setOpen({ x: rect.right - 16, y: rect.top })
    }

    function close(): void {
        stickyUntilEnter = false
        clearOpenTimer()
        clearCloseTimer()
        opts.setOpen(null)
    }

    function openFromClick(): void {
        stickyUntilEnter = true
        open()
    }

    function scheduleOpen(): void {
        clearCloseTimer()
        if (opts.isOpen() || openTimer != null) return
        openTimer = setTimeout(() => {
            openTimer = undefined
            open()
        }, MENU_SUBMENU_DELAY_MS)
    }

    function scheduleClose(): void {
        clearOpenTimer()
        if (stickyUntilEnter) return
        if (closeTimer != null) return
        closeTimer = setTimeout(() => {
            closeTimer = undefined
            stickyUntilEnter = false
            opts.setOpen(null)
        }, MENU_SUBMENU_DELAY_MS)
    }

    function cancelClose(): void {
        stickyUntilEnter = false
        clearCloseTimer()
    }

    function clear(): void {
        stickyUntilEnter = false
        clearOpenTimer()
        clearCloseTimer()
    }

    return {
        open,
        openFromClick,
        close,
        scheduleOpen,
        scheduleClose,
        cancelClose,
        clear,
    }
}
