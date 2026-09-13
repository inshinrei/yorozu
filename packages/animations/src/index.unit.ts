import { describe, expect, it } from "vitest"
import * as animations from "./index"

describe("package barrel", () => {
    it("exports dualRaf, tween, and the heavy-motion lock", () => {
        expect(typeof animations.dualRaf).toBe("function")
        expect(typeof animations.tween).toBe("function")
        expect(typeof animations.createHeavyAnimationLock).toBe("function")
        expect(animations.DEFAULT_HEAVY_LOCK_TIMEOUT_MS).toBe(1000)
        expect(typeof animations.queueMeasure).toBe("function")
        expect(typeof animations.queueMutate).toBe("function")
        expect(typeof animations.queueMeasureAfterMutate).toBe("function")
        expect(typeof animations.flushDomSchedule).toBe("function")
        expect(typeof animations.onAnimationFrame).toBe("function")
        expect(typeof animations.createViewSlide).toBe("function")
        expect(typeof animations.createListReorder).toBe("function")
        expect(typeof animations.createFade).toBe("function")
        expect(typeof animations.createSharedElement).toBe("function")
        expect(typeof animations.playSharedElement).toBe("function")
        expect(typeof animations.createCancelGroup).toBe("function")
        expect(typeof animations.createLayoutSizeTween).toBe("function")
    })

    it("re-exports motion timing tokens and aliases", () => {
        expect(animations.MOTION_UI_MS).toBe(200)
        expect(animations.MOTION_NAV_MS).toBe(350)
        expect(animations.FADE_MS).toBe(animations.MOTION_UI_MS)
        expect(animations.SHARED_ELEMENT_MS).toBe(animations.MOTION_NAV_MS)
    })
})
