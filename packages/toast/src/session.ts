export type ToastPlacement = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right"

export const TOAST_DURATION_MS: number = 5000
export const TOAST_EXIT_MS: number = 200
export const TOAST_RESUME_MIN_MS: number = 50
export const TOAST_ENTER_MS: number = 150
export const TOAST_SCALE: number = 0.85
export const TOAST_PLACEMENT_DEFAULT: ToastPlacement = "bottom-left"

export type ToastMount = (container: HTMLElement) => void | (() => void)
export type ToastContent = string | ToastMount

export type ToastShowOpts = {
    duration?: number
    permanent?: boolean
}

export type ToastRecord<T = ToastContent> = {
    id: string
    content: T
    duration: number
    permanent: boolean
    exiting: boolean
}

export type ToastSessionOpts = {
    generateId?: () => string
    duration?: number
    exitMs?: number
    placement?: ToastPlacement
}

export type ToastSession<T = ToastContent> = {
    show: (content: T, durationOrOpts?: number | ToastShowOpts) => string
    dismiss: (id: string) => void
    pause: (id: string) => void
    resume: (id: string) => void
    subscribe: (listener: () => void) => () => void
    toasts: () => readonly ToastRecord<T>[]
    placement: () => ToastPlacement
    destroy: () => void
}

type Slot<T> = {
    record: ToastRecord<T>
    remaining: number
    timer: ReturnType<typeof setTimeout> | null
    exitTimer: ReturnType<typeof setTimeout> | null
    startedAt: number | null
}

let fallbackSeq = 0

function defaultId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID()
    }
    fallbackSeq += 1
    return `toast-${fallbackSeq}`
}

function resolveShowOpts(
    arg: number | ToastShowOpts | undefined,
    fallbackDuration: number,
): { duration: number; permanent: boolean } {
    if (typeof arg === "number") return { duration: arg, permanent: false }
    let permanent = arg?.permanent === true
    if (permanent) return { duration: 0, permanent: true }
    return { duration: arg?.duration ?? fallbackDuration, permanent: false }
}

export function createToastSession<T = ToastContent>(opts?: ToastSessionOpts): ToastSession<T> {
    let generateId = opts?.generateId ?? defaultId
    let defaultDuration = opts?.duration ?? TOAST_DURATION_MS
    let exitMs = opts?.exitMs ?? TOAST_EXIT_MS
    let place = opts?.placement ?? TOAST_PLACEMENT_DEFAULT
    let slots: Slot<T>[] = []
    let listeners = new Set<() => void>()
    let alive = true

    function notify(): void {
        for (let listener of listeners) listener()
    }

    function toasts(): readonly ToastRecord<T>[] {
        return slots.map((s) => s.record)
    }

    function findSlot(id: string): Slot<T> | undefined {
        return slots.find((s) => s.record.id === id)
    }

    function clearAuto(slot: Slot<T>): void {
        if (slot.timer != null) {
            clearTimeout(slot.timer)
            slot.timer = null
        }
        slot.startedAt = null
    }

    function clearExit(slot: Slot<T>): void {
        if (slot.exitTimer != null) {
            clearTimeout(slot.exitTimer)
            slot.exitTimer = null
        }
    }

    function remove(id: string): void {
        let index = slots.findIndex((s) => s.record.id === id)
        if (index === -1) return
        let slot = slots[index]!
        clearAuto(slot)
        clearExit(slot)
        slots.splice(index, 1)
        notify()
    }

    function armTimer(slot: Slot<T>): void {
        if (!alive || slot.record.permanent || slot.record.exiting) return
        clearAuto(slot)
        slot.startedAt = Date.now()
        slot.timer = setTimeout(() => {
            slot.timer = null
            slot.startedAt = null
            dismiss(slot.record.id)
        }, slot.remaining)
    }

    function show(content: T, durationOrOpts?: number | ToastShowOpts): string {
        if (!alive) return ""
        let resolved = resolveShowOpts(durationOrOpts, defaultDuration)
        let record: ToastRecord<T> = {
            id: generateId(),
            content,
            duration: resolved.duration,
            permanent: resolved.permanent,
            exiting: false,
        }
        let slot: Slot<T> = {
            record,
            remaining: resolved.permanent ? 0 : resolved.duration,
            timer: null,
            exitTimer: null,
            startedAt: null,
        }
        slots.push(slot)
        if (!resolved.permanent) armTimer(slot)
        notify()
        return record.id
    }

    function dismiss(id: string): void {
        if (!alive) return
        let slot = findSlot(id)
        if (!slot || slot.record.exiting) return
        slot.record.exiting = true
        clearAuto(slot)
        notify()
        if (exitMs <= 0) {
            remove(id)
            return
        }
        slot.exitTimer = setTimeout(() => {
            slot.exitTimer = null
            remove(id)
        }, exitMs)
    }

    function pause(id: string): void {
        if (!alive) return
        let slot = findSlot(id)
        if (!slot || slot.record.permanent || slot.record.exiting) return
        if (slot.timer == null) return
        clearTimeout(slot.timer)
        slot.timer = null
        if (slot.startedAt != null) {
            slot.remaining = Math.max(0, slot.remaining - (Date.now() - slot.startedAt))
            slot.startedAt = null
        }
    }

    function resume(id: string): void {
        if (!alive) return
        let slot = findSlot(id)
        if (!slot || slot.record.permanent || slot.record.exiting) return
        if (slot.timer != null) return
        if (slot.remaining <= TOAST_RESUME_MIN_MS) {
            dismiss(id)
            return
        }
        armTimer(slot)
    }

    function subscribe(listener: () => void): () => void {
        listeners.add(listener)
        return () => {
            listeners.delete(listener)
        }
    }

    function destroy(): void {
        if (!alive) return
        alive = false
        for (let slot of slots) {
            clearAuto(slot)
            clearExit(slot)
        }
        slots.length = 0
        notify()
        listeners.clear()
    }

    function placement(): ToastPlacement {
        return place
    }

    return { show, dismiss, pause, resume, subscribe, toasts, placement, destroy }
}
