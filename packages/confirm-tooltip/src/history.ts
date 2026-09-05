import { bindHistoryLayer, type HistoryLayer } from "@yorozu/context-menu"

export const CONFIRM_TOOLTIP_HISTORY_STATE: { yorozuConfirm: 1 } = { yorozuConfirm: 1 }
export const CONFIRM_TOOLTIP_PENDING_HISTORY_KEYS: readonly string[] = ["yorozuMenu", "yorozuConfirm"]

export function isPendingOverlayHistory(state: unknown, keys?: readonly string[]): boolean {
    if (state == null || typeof state !== "object") return false
    let rec = state as Record<string, unknown>
    let list = keys ?? CONFIRM_TOOLTIP_PENDING_HISTORY_KEYS
    return list.some((key) => rec[key] === 1)
}

export function bindHistoryWhenIdle(opts: {
    onBack: () => void
    state: Record<string, unknown>
    pendingKeys?: readonly string[]
}): HistoryLayer {
    let released = false
    let inner: HistoryLayer | undefined
    let keys = opts.pendingKeys ?? CONFIRM_TOOLTIP_PENDING_HISTORY_KEYS

    function arm(): void {
        if (released || inner) return
        window.removeEventListener("popstate", onPop)
        inner = bindHistoryLayer({ onBack: opts.onBack, state: opts.state })
    }

    function onPop(): void {
        arm()
    }

    if (typeof history !== "undefined" && isPendingOverlayHistory(history.state, keys)) {
        window.addEventListener("popstate", onPop)
    } else {
        arm()
    }

    return {
        release(): void {
            if (released) return
            released = true
            window.removeEventListener("popstate", onPop)
            inner?.release()
        },
    }
}
