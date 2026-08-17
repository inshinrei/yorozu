import { describe, expect, it } from "vitest"
import { parseImportSpecifier, splitImportRequest } from "./external-libs"

describe("parseImportSpecifier", () => {
    it("should parse npm: specifiers", () => {
        expect(parseImportSpecifier("npm:foo@^1.0.0")).toEqual({
            registry: "npm",
            packageName: "foo",
            version: "^1.0.0",
        })
    })

    it("should parse scoped npm: specifiers", () => {
        expect(parseImportSpecifier("npm:@foo/bar@1.0.0")).toEqual({
            registry: "npm",
            packageName: "@foo/bar",
            version: "1.0.0",
        })
    })

    it("should parse jsr: specifiers", () => {
        expect(parseImportSpecifier("jsr:foo@1.0.0")).toEqual({
            registry: "jsr",
            packageName: "foo",
            version: "1.0.0",
        })
    })

    it("should parse scoped jsr: specifiers", () => {
        expect(parseImportSpecifier("jsr:@foo/bar@1.0.0")).toEqual({
            registry: "jsr",
            packageName: "@foo/bar",
            version: "1.0.0",
        })
    })

    it("should handle jsr:/ specifiers", () => {
        expect(parseImportSpecifier("jsr:/@foo/bar@1.0.0/lol")).toEqual({
            registry: "jsr",
            packageName: "@foo/bar",
            version: "1.0.0",
        })
    })

    it("should error on invalid specifiers", () => {
        expect(() => parseImportSpecifier("foo:bar")).toThrow("Invalid import specifier: foo:bar")
    })
})

describe("splitImportRequest", () => {
    it("splits scoped jsr specifiers", () => {
        expect(splitImportRequest("jsr:@foo/bar/path")).toEqual(["jsr:@foo/bar", "path"])
    })

    it("normalizes jsr:/ prefixes", () => {
        expect(splitImportRequest("jsr:/@foo/bar/path")).toEqual(["jsr:@foo/bar", "path"])
    })
})
