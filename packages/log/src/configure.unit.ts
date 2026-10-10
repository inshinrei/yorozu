import { afterEach, describe, expect, it } from "vitest"
import { configure, getConfig } from "./configure"
import type { LogHandler } from "./types"

afterEach(() => {
    configure({})
})

describe("configure / getConfig", () => {
    it("has no handlers and no level after configure({})", () => {
        configure({})
        let config = getConfig()
        expect(config.handlers).toBeUndefined()
        expect(config.level).toBeUndefined()
        expect(config.subsystems).toBeUndefined()
    })

    it("reflects handlers, level, and subsystems", () => {
        let h: LogHandler = () => {}
        configure({
            handlers: [h],
            level: "warning",
            subsystems: { db: { level: "error" } },
        })
        let config = getConfig()
        expect(config.handlers).toEqual([h])
        expect(config.level).toBe("warning")
        expect(config.subsystems).toEqual({ db: { level: "error" } })
    })

    it("replaces the previous config instead of merging", () => {
        let h: LogHandler = () => {}
        let h2: LogHandler = () => {}
        configure({
            handlers: [h],
            level: "warning",
            subsystems: { db: { level: "error" } },
        })
        configure({ handlers: [h2] })
        let config = getConfig()
        expect(config.handlers).toEqual([h2])
        expect(config.level).toBeUndefined()
        expect(config.subsystems).toBeUndefined()
    })

    it("returns a copy of handlers so pushing does not add a handler", () => {
        let h: LogHandler = () => {}
        let extra: LogHandler = () => {}
        configure({ handlers: [h] })
        getConfig().handlers!.push(extra)
        expect(getConfig().handlers).toEqual([h])
    })

    it("returns a shallow copy of subsystems", () => {
        configure({
            handlers: [],
            subsystems: { db: { level: "error" } },
        })
        getConfig().subsystems!["other"] = { level: "info" }
        expect(getConfig().subsystems).toEqual({ db: { level: "error" } })
        expect(getConfig().subsystems!["other"]).toBeUndefined()
    })
})
