import { vi, type Mock } from "vitest"

export type FakeAnimation = {
    finished: Promise<void>
    cancel: () => void
}

export type FakeAnimate = (this: unknown, frames: Keyframe[], options?: KeyframeAnimationOptions) => FakeAnimation

export function createFakeAnimate(impl?: FakeAnimate): Mock<FakeAnimate> {
    return vi.fn<FakeAnimate>(impl ?? (() => ({ finished: Promise.resolve(), cancel: vi.fn() })))
}
