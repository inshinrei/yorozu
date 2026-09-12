import { describe, expect, it } from "vitest"
import * as animations from "./index"

describe("package barrel", () => {
    it("exports dualRaf, tween, and the heavy-motion lock", () => {
        expect(typeof animations.dualRaf).toBe("function")
        expect(typeof animations.tween).toBe("function")
        expect(typeof animations.createHeavyAnimationLock).toBe("function")
        expect(animations.DEFAULT_HEAVY_LOCK_TIMEOUT_MS).toBe(1000)
        expect(typeof animations.createViewSlide).toBe("function")
        expect(typeof animations.createListReorder).toBe("function")
        expect(typeof animations.createFade).toBe("function")
        expect(typeof animations.createSharedElement).toBe("function")
        expect(typeof animations.playSharedElement).toBe("function")
    })
})
