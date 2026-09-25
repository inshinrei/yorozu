import { describe, expect, it } from "vitest"
import { E2E_PROJECTS, isUnusableE2eSince, mapChangedFilesToE2eProjects, selectChangedE2eProjects } from "./e2e"

describe("mapChangedFilesToE2eProjects", () => {
    it("maps package src to its project and dependents", () => {
        expect(mapChangedFilesToE2eProjects(["packages/confirm-tooltip/src/session.ts"])).toEqual(["confirm-tooltip"])
        expect(mapChangedFilesToE2eProjects(["packages/context-menu/src/session.ts"])).toEqual([
            "confirm-tooltip",
            "context-menu",
        ])
        expect(mapChangedFilesToE2eProjects(["packages/virtual-list/src/list.ts"])).toEqual([
            "media-viewer",
            "virtual-list",
        ])
        expect(mapChangedFilesToE2eProjects(["packages/sortable/src/session.ts"])).toEqual(["sortable"])
        expect(mapChangedFilesToE2eProjects(["packages/media-viewer/src/attach.ts"])).toEqual(["media-viewer"])
    })

    it("maps e2e page files to that project", () => {
        expect(mapChangedFilesToE2eProjects(["e2e/tests/confirm-tooltip.spec.ts"])).toEqual(["confirm-tooltip"])
        expect(mapChangedFilesToE2eProjects(["e2e/src/context-menu.ts"])).toEqual(["context-menu"])
        expect(mapChangedFilesToE2eProjects(["e2e/sortable.html"])).toEqual(["sortable"])
    })

    it("maps shared e2e infra to all five projects", () => {
        expect(mapChangedFilesToE2eProjects(["e2e/helpers/wait.ts"])).toEqual([...E2E_PROJECTS])
        expect(mapChangedFilesToE2eProjects(["e2e/vite.config.ts"])).toEqual([...E2E_PROJECTS])
        expect(mapChangedFilesToE2eProjects(["playwright.config.ts"])).toEqual([...E2E_PROJECTS])
        expect(mapChangedFilesToE2eProjects(["e2e/public/media/img.png"])).toEqual([...E2E_PROJECTS])
    })

    it("ignores unit tests, markdown, dist, playground, and unrelated packages", () => {
        expect(mapChangedFilesToE2eProjects(["packages/confirm-tooltip/src/session.unit.ts"])).toEqual([])
        expect(mapChangedFilesToE2eProjects(["packages/toast/src/session.ts"])).toEqual([])
        expect(mapChangedFilesToE2eProjects(["README.md"])).toEqual([])
        expect(mapChangedFilesToE2eProjects(["packages/media-viewer/playground/src/main.ts"])).toEqual([])
        expect(mapChangedFilesToE2eProjects(["packages/sortable/dist/index.js"])).toEqual([])
    })
})

describe("isUnusableE2eSince", () => {
    it("treats missing, empty, and all-zero shas as unusable", () => {
        expect(isUnusableE2eSince(undefined)).toBe(true)
        expect(isUnusableE2eSince(null)).toBe(true)
        expect(isUnusableE2eSince("")).toBe(true)
        expect(isUnusableE2eSince("   ")).toBe(true)
        expect(isUnusableE2eSince("0000000")).toBe(true)
        expect(isUnusableE2eSince("0000000000000000000000000000000000000000")).toBe(true)
        expect(isUnusableE2eSince("e182e550fe8783738e13baea655b1ae348eddb40")).toBe(false)
        expect(isUnusableE2eSince("HEAD~1")).toBe(false)
    })
})

describe("selectChangedE2eProjects", () => {
    it("runs all five when since is empty, all-zeros, or git diff failed", () => {
        expect(selectChangedE2eProjects({ since: "" })).toEqual([...E2E_PROJECTS])
        expect(selectChangedE2eProjects({ since: "0000000000000000000000000000000000000000" })).toEqual([
            ...E2E_PROJECTS,
        ])
        expect(
            selectChangedE2eProjects({
                since: "abc123",
                gitFailed: true,
                files: ["packages/sortable/src/session.ts"],
            }),
        ).toEqual([...E2E_PROJECTS])
    })

    it("maps files when since is a real rev and git succeeded", () => {
        expect(
            selectChangedE2eProjects({
                since: "abc123",
                files: ["packages/sortable/src/session.ts"],
            }),
        ).toEqual(["sortable"])
        expect(selectChangedE2eProjects({ since: "abc123", files: [] })).toEqual([])
    })
})
