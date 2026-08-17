import { animateElement } from "../core/playback"
import { dualRaf } from "../core/raf"
import { applyStyles, clearStyles } from "../core/styles"
import type { AttachHandle, Key } from "../core/types"
import {
    viewSlideTransforms,
    type PanelRole,
    type SlideDirection,
    type SlidePanelState,
    type SlideTransforms,
    type ViewSlideMode,
    type ViewSlideMountPolicy,
} from "./transforms"

export const VIEW_SLIDE_MS: number = 300
export const VIEW_SLIDE_EASING: string = "cubic-bezier(0.25, 1, 0.5, 1)"
export const VIEW_SLIDE_SETTLE_SLACK_MS: number = 80

export type { PanelRole, SlideDirection, SlidePanelState, SlideTransforms, ViewSlideMode, ViewSlideMountPolicy }

const PANEL_STYLE_KEYS: readonly string[] = ["transform", "opacity", "will-change"]

export type ViewSlideConfig = {
    getMode: () => ViewSlideMode
    getDirection: (from: Key, to: Key) => SlideDirection | null
    transforms?: (dir: SlideDirection, mode: Exclude<ViewSlideMode, "none">) => SlideTransforms
    durationMs?: (mode: Exclude<ViewSlideMode, "none">) => number
    mountPolicy?: ViewSlideMountPolicy
    settleSlackMs?: number
}

export type ViewSlide = {
    readonly mountedKeys: readonly Key[]
    readonly animating: boolean
    readonly leavingKey: Key | undefined
    setActive: (key: Key | undefined) => void
    attach: (el: HTMLElement, key: Key) => AttachHandle
    isMounted: (key: Key) => boolean
    isVisible: (key: Key) => boolean
    role: (key: Key) => PanelRole
    cancel: () => void
    destroy: () => void
}

type Pending = { from: Key; to: Key; gen: number }

type ActivePair = {
    gen: number
    from: Key
    to: Key
    fromEl: HTMLElement
    toEl: HTMLElement
    fromAnim: Animation | null
    toAnim: Animation | null
    settleTimer: ReturnType<typeof setTimeout> | null
    onEnd: (event: Event) => void
}

function applyPanel(el: HTMLElement, state: SlidePanelState): void {
    applyStyles(el, {
        transform: state.transform,
        opacity: state.opacity,
        "will-change": "transform, opacity",
    })
}

function clearPanel(el: HTMLElement): void {
    clearStyles(el, PANEL_STYLE_KEYS)
}

export function createViewSlide(config: ViewSlideConfig): ViewSlide {
    let mountPolicy: ViewSlideMountPolicy = config.mountPolicy ?? "keep-visited"
    let settleSlackMs = config.settleSlackMs ?? VIEW_SLIDE_SETTLE_SLACK_MS
    let resolveTransforms = config.transforms ?? viewSlideTransforms
    let resolveDuration = config.durationMs ?? ((_mode: Exclude<ViewSlideMode, "none">): number => VIEW_SLIDE_MS)

    let mountedKeys: Key[] = []
    let panelEls = new Map<Key, HTMLElement>()
    let animating = false
    let leavingKey: Key | undefined
    let lastRequestedKey: Key | undefined
    let pending: Pending | null = null
    let pair: ActivePair | null = null
    let slideGen = 0
    let destroyed = false

    let isMounted = (key: Key): boolean => mountedKeys.includes(key)

    let ensureMounted = (key: Key): void => {
        if (!mountedKeys.includes(key)) mountedKeys = [...mountedKeys, key]
    }

    let retainOnly = (keys: readonly Key[]): void => {
        let wanted = keys.filter((key, index) => keys.indexOf(key) === index)
        let ordered = mountedKeys.filter((key) => wanted.includes(key))
        for (let key of wanted) {
            if (!ordered.includes(key)) ordered.push(key)
        }
        mountedKeys = ordered
    }

    let applyMountAfterSettle = (active: Key): void => {
        if (mountPolicy === "keep-visited") return
        retainOnly([active])
    }

    let isVisible = (key: Key): boolean => {
        if (key === lastRequestedKey) return true
        return animating && key === leavingKey
    }

    let role = (key: Key): PanelRole => {
        if (animating) {
            if (key === lastRequestedKey) return "entering"
            if (key === leavingKey) return "leaving"
            return "idle"
        }
        return key === lastRequestedKey ? "active" : "idle"
    }

    let detachPair = (active: ActivePair): void => {
        if (active.settleTimer != null) {
            clearTimeout(active.settleTimer)
            active.settleTimer = null
        }
        active.fromAnim?.cancel()
        active.toAnim?.cancel()
        active.fromAnim = null
        active.toAnim = null
        active.fromEl.removeEventListener("transitionend", active.onEnd)
        active.toEl.removeEventListener("transitionend", active.onEnd)
        clearPanel(active.fromEl)
        clearPanel(active.toEl)
    }

    let abortInFlight = (): void => {
        pending = null
        if (!pair) return
        detachPair(pair)
        pair = null
    }

    let finishSlide = (gen: number, to: Key): void => {
        if (gen !== slideGen || destroyed) return
        if (pair && pair.gen === gen) detachPair(pair)
        pair = null
        pending = null
        animating = false
        leavingKey = undefined
        applyMountAfterSettle(to)
    }

    let abortToInstant = (from: Key, to: Key, gen: number): void => {
        if (gen !== slideGen || destroyed) return
        let fromEl = panelEls.get(from)
        let toEl = panelEls.get(to)
        if (fromEl) clearPanel(fromEl)
        if (toEl) clearPanel(toEl)
        animating = false
        leavingKey = undefined
        pending = null
        applyMountAfterSettle(to)
    }

    let performSlide = async (
        from: Key,
        to: Key,
        fromEl: HTMLElement,
        toEl: HTMLElement,
        dir: SlideDirection,
        mode: Exclude<ViewSlideMode, "none">,
        gen: number,
    ): Promise<void> => {
        if (gen !== slideGen || destroyed) return
        let tx = resolveTransforms(dir, mode)
        let ms = resolveDuration(mode)

        animating = true
        leavingKey = from
        applyPanel(fromEl, tx.fromStart)
        applyPanel(toEl, tx.toStart)
        void fromEl.offsetWidth
        void toEl.offsetWidth

        let onEnd = (event: Event): void => {
            if (event.target !== toEl) return
            let propertyName = (event as TransitionEvent).propertyName
            if (propertyName && propertyName !== "transform") return
            finishSlide(gen, to)
        }
        fromEl.addEventListener("transitionend", onEnd)
        toEl.addEventListener("transitionend", onEnd)

        let active: ActivePair = {
            gen,
            from,
            to,
            fromEl,
            toEl,
            fromAnim: null,
            toAnim: null,
            settleTimer: null,
            onEnd,
        }
        pair = active
        active.settleTimer = setTimeout(() => {
            finishSlide(gen, to)
        }, ms + settleSlackMs)

        await dualRaf()
        if (gen !== slideGen || destroyed || pair !== active) return

        active.fromAnim = animateElement(fromEl, [tx.fromStart, tx.fromEnd], {
            duration: ms,
            easing: VIEW_SLIDE_EASING,
            fill: "forwards",
        })
        active.toAnim = animateElement(toEl, [tx.toStart, tx.toEnd], {
            duration: ms,
            easing: VIEW_SLIDE_EASING,
            fill: "forwards",
        })

        if (active.toAnim) {
            void active.toAnim.finished.then(
                () => finishSlide(gen, to),
                () => undefined,
            )
        }
    }

    /** Start the pair only after both panels have an attached node. */
    let tryRunPending = (): void => {
        if (!pending || destroyed) return
        let fromEl = panelEls.get(pending.from)
        let toEl = panelEls.get(pending.to)
        if (!fromEl || !toEl) return

        let { from, to, gen } = pending
        pending = null

        let mode = config.getMode()
        let dir = config.getDirection(from, to)
        if (!dir || mode === "none") {
            abortToInstant(from, to, gen)
            return
        }

        void performSlide(from, to, fromEl, toEl, dir, mode, gen)
    }

    let setActive = (key: Key | undefined): void => {
        if (destroyed) return
        if (key === lastRequestedKey) return

        if (lastRequestedKey == null) {
            lastRequestedKey = key
            if (key != null) ensureMounted(key)
            return
        }

        let from = lastRequestedKey
        lastRequestedKey = key
        // Newer setActive wins; in-flight finish callbacks see a stale gen.
        slideGen++
        abortInFlight()

        if (key == null) {
            animating = false
            leavingKey = undefined
            if (mountPolicy !== "keep-visited") retainOnly([])
            return
        }

        ensureMounted(from)
        ensureMounted(key)
        animating = true
        leavingKey = from
        pending = { from, to: key, gen: slideGen }
        tryRunPending()
    }

    let attach = (el: HTMLElement, key: Key): AttachHandle => {
        if (!destroyed) {
            panelEls.set(key, el)
            tryRunPending()
        }
        return {
            update: (next: Key): void => {
                if (destroyed || next === key) return
                if (panelEls.get(key) === el) panelEls.delete(key)
                key = next
                panelEls.set(key, el)
                tryRunPending()
            },
            destroy: (): void => {
                if (panelEls.get(key) === el) panelEls.delete(key)
            },
        }
    }

    let cancel = (): void => {
        if (destroyed) return
        slideGen++
        abortInFlight()
        animating = false
        leavingKey = undefined
        if (lastRequestedKey != null && mountPolicy !== "keep-visited") {
            applyMountAfterSettle(lastRequestedKey)
        }
    }

    let destroy = (): void => {
        if (destroyed) return
        destroyed = true
        slideGen++
        abortInFlight()
        for (let el of panelEls.values()) clearPanel(el)
        animating = false
        leavingKey = undefined
        lastRequestedKey = undefined
        pending = null
        pair = null
        panelEls.clear()
        mountedKeys = []
    }

    return {
        get mountedKeys(): readonly Key[] {
            return mountedKeys
        },
        get animating(): boolean {
            return animating
        },
        get leavingKey(): Key | undefined {
            return leavingKey
        },
        setActive,
        attach,
        isMounted,
        isVisible,
        role,
        cancel,
        destroy,
    }
}
