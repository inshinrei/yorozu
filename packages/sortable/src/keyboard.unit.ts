// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { toTargetIndex } from "./geometry"
import { destinationToInsertIndex, isTypingField, stepDestination } from "./keyboard"

describe("destinationToInsertIndex", () => {
    it("is the inverse of toTargetIndex with in-place visual at srcIdx", () => {
        expect(destinationToInsertIndex(2, 2)).toBe(2)
        expect(destinationToInsertIndex(2, 3)).toBe(4)
        expect(destinationToInsertIndex(2, 1)).toBe(1)
        expect(destinationToInsertIndex(2, 0)).toBe(0)
        expect(toTargetIndex(2, destinationToInsertIndex(2, 2))).toBe(2)
        expect(toTargetIndex(2, destinationToInsertIndex(2, 3))).toBe(3)
        expect(toTargetIndex(2, destinationToInsertIndex(2, 1))).toBe(1)
        expect(toTargetIndex(2, destinationToInsertIndex(2, 0))).toBe(0)
    })
})

describe("stepDestination", () => {
    it("steps and clamps in destination space", () => {
        expect(stepDestination(0, 0, 1, 4)).toBe(1)
        expect(stepDestination(0, destinationToInsertIndex(0, 1), 1, 4)).toBe(2)
        expect(stepDestination(0, 0, -1, 4)).toBe(0)
        expect(stepDestination(3, destinationToInsertIndex(3, 3), 1, 4)).toBe(3)
        expect(stepDestination(0, 0, 1, 0)).toBe(0)
    })
})

describe("isTypingField", () => {
    it("is true for input textarea select and contenteditable true", () => {
        let input = document.createElement("input")
        let textarea = document.createElement("textarea")
        let select = document.createElement("select")
        let editable = document.createElement("div")
        editable.setAttribute("contenteditable", "true")
        expect(isTypingField(input)).toBe(true)
        expect(isTypingField(textarea)).toBe(true)
        expect(isTypingField(select)).toBe(true)
        expect(isTypingField(editable)).toBe(true)
    })

    it("is false for contenteditable false, button, div, and null", () => {
        let inert = document.createElement("div")
        inert.setAttribute("contenteditable", "false")
        let button = document.createElement("button")
        let div = document.createElement("div")
        expect(isTypingField(inert)).toBe(false)
        expect(isTypingField(button)).toBe(false)
        expect(isTypingField(div)).toBe(false)
        expect(isTypingField(null)).toBe(false)
    })
})
