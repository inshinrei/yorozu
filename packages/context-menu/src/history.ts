export const MENU_HISTORY_STATE: { yorozuMenu: 1 } = { yorozuMenu: 1 }

export function isMenuHistoryState(state: unknown, marker?: Record<string, unknown>): boolean {
    if (state == null || typeof state !== "object") return false
    let expected: Record<string, unknown> = marker ?? MENU_HISTORY_STATE
    let record = state as Record<string, unknown>
    for (let key of Object.keys(expected)) {
        if (record[key] !== expected[key]) return false
    }
    return true
}

export type HistoryLayer = {
    release: () => void
}

export function bindHistoryLayer(opts: { onBack: () => void; state?: Record<string, unknown> }): HistoryLayer {
    let marker = opts.state ?? MENU_HISTORY_STATE
    let released = false

    history.pushState(marker, "")

    function onPopState(): void {
        if (released) return
        released = true
        window.removeEventListener("popstate", onPopState)
        opts.onBack()
    }

    window.addEventListener("popstate", onPopState)

    return {
        release(): void {
            if (released) return
            released = true
            window.removeEventListener("popstate", onPopState)
            if (isMenuHistoryState(history.state, marker)) {
                history.go(-1)
            }
        },
    }
}
