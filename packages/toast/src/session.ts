import { STACK_LAYER_MAX_BEHIND } from "@yorozu/animations"

export type ToastPlacement = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right"

export const TOAST_DURATION_MS: number = 5000
export const TOAST_EXIT_MS: number = 200
export const TOAST_RESUME_MIN_MS: number = 50
export const TOAST_ENTER_MS: number = 150
export const TOAST_SCALE: number = 0.85
export const TOAST_PLACEMENT_DEFAULT: ToastPlacement = "bottom-left"
export const TOAST_STACK_MAX_BEHIND: number = STACK_LAYER_MAX_BEHIND

export type ToastMount = (container: HTMLElement) => void | (() => void)
export type ToastContent = string | ToastMount

export type ToastShowOpts = {
    duration?: number
    permanent?: boolean
    width?: number
    height?: number
    progress?: boolean
}

export type ToastUpdateOpts<T = ToastContent> = {
    content?: T
    duration?: number
    permanent?: boolean
    width?: number
    height?: number
    progress?: boolean
}

export type ToastRecord<T = ToastContent> = {
    id: string
    content: T
    duration: number
    permanent: boolean
    exiting: boolean
    width?: number
    height?: number
    progress: boolean
}

export type ToastSessionOpts = {
    generateId?: () => string
    duration?: number
    exitMs?: number
    placement?: ToastPlacement
}

export type ToastSession<T = ToastContent> = {
    show: (content: T, durationOrOpts?: number | ToastShowOpts) => string
    update: (id: string, patch: ToastUpdateOpts<T>) => void
    remaining: (id: string) => number
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

function positivePx(value: number | undefined): number | undefined {
    if (typeof value === "number" && value > 0) return value
    return undefined
}

function resolveShowOpts(
    arg: number | ToastShowOpts | undefined,
    fallbackDuration: number,
): {
    duration: number
    permanent: boolean
    width?: number
    height?: number
    progress: boolean
} {
    if (typeof arg === "number") return { duration: arg, permanent: false, progress: false }
    let permanent = arg?.permanent === true
    let progress = arg?.progress === true
    let width = positivePx(arg?.width)
    let height = positivePx(arg?.height)
    if (permanent) return { duration: 0, permanent: true, width, height, progress }
    return { duration: arg?.duration ?? fallbackDuration, permanent: false, width, height, progress }
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
            progress: resolved.progress,
        }
        if (resolved.width != null) record.width = resolved.width
        if (resolved.height != null) record.height = resolved.height
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

    function remaining(id: string): number {
        if (!alive) return 0
        let slot = findSlot(id)
        if (!slot || slot.record.permanent || slot.record.exiting) return 0
        if (slot.timer != null && slot.startedAt != null) {
            return Math.max(0, slot.remaining - (Date.now() - slot.startedAt))
        }
        return slot.remaining
    }

    function moveToEnd(slot: Slot<T>): void {
        let index = slots.indexOf(slot)
        if (index === -1 || index === slots.length - 1) return
        slots.splice(index, 1)
        slots.push(slot)
    }

    function update(id: string, patch: ToastUpdateOpts<T>): void {
        if (!alive) return
        let slot = findSlot(id)
        if (!slot || slot.record.exiting) return
        let record = slot.record
        let changed = false
        let released = false

        if ("content" in patch && !Object.is(patch.content, record.content)) {
            record.content = patch.content as T
            changed = true
        }
        if (typeof patch.width === "number" && patch.width > 0 && patch.width !== record.width) {
            record.width = patch.width
            changed = true
        }
        if (typeof patch.height === "number" && patch.height > 0 && patch.height !== record.height) {
            record.height = patch.height
            changed = true
        }
        if (typeof patch.progress === "boolean" && patch.progress !== record.progress) {
            record.progress = patch.progress
            changed = true
        }
        if (patch.permanent === true && !record.permanent) {
            record.permanent = true
            record.duration = 0
            slot.remaining = 0
            clearAuto(slot)
            changed = true
        } else if (patch.permanent === false && record.permanent) {
            record.permanent = false
            let nextDuration =
                typeof patch.duration === "number" && patch.duration >= 0 ? patch.duration : defaultDuration
            record.duration = nextDuration
            slot.remaining = nextDuration
            released = true
            changed = true
            moveToEnd(slot)
            armTimer(slot)
        }
        if (!record.permanent && !released && typeof patch.duration === "number" && patch.duration >= 0) {
            record.duration = patch.duration
            slot.remaining = patch.duration
            armTimer(slot)
            changed = true
        }
        if (changed) notify()
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

    return { show, update, remaining, dismiss, pause, resume, subscribe, toasts, placement, destroy }
}
