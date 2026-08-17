import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { findPreferProtectedIssues, rewritePreferProtected, validatePreferProtected } from "./validate-prefer-protected"

describe("findPreferProtectedIssues", () => {
    it("flags a private class field", () => {
        let errors = findPreferProtectedIssues(
            [
                "export class Lock {",
                "    private _queue = 1",
                "}",
                "",
            ].join("\n"),
            "lock.ts",
        )

        expect(errors).toEqual([
            {
                type: "prefer_protected",
                file: "lock.ts",
                line: 2,
                column: 5,
                kind: "private_keyword",
                name: "_queue",
            },
        ])
    })

    it("flags a private class method", () => {
        let errors = findPreferProtectedIssues(
            [
                "export class Docs {",
                "    private _forward(): void {}",
                "}",
                "",
            ].join("\n"),
            "docs.ts",
        )

        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatchObject({
            kind: "private_keyword",
            name: "_forward",
            line: 2,
        })
    })

    it("flags a private constructor parameter property", () => {
        let errors = findPreferProtectedIssues(
            [
                "export class Fake {",
                "    constructor(private readonly address: string) {}",
                "}",
                "",
            ].join("\n"),
            "fake.ts",
        )

        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatchObject({
            kind: "private_keyword",
            name: "address",
            line: 2,
        })
    })

    it("flags #fields and this.#field references", () => {
        let errors = findPreferProtectedIssues(
            [
                "export class Bytes {",
                "    #buffer: Uint8Array",
                "    size(): number {",
                "        return this.#buffer.length",
                "    }",
                "}",
                "",
            ].join("\n"),
            "bytes.ts",
        )

        expect(errors).toEqual([
            {
                type: "prefer_protected",
                file: "bytes.ts",
                line: 2,
                column: 5,
                kind: "private_identifier",
                name: "buffer",
            },
            {
                type: "prefer_protected",
                file: "bytes.ts",
                line: 4,
                column: 21,
                kind: "private_identifier",
                name: "buffer",
            },
        ])
    })

    it("flags a #method declaration", () => {
        let errors = findPreferProtectedIssues(
            [
                "export class Reader {",
                "    #fill(): void {}",
                "}",
                "",
            ].join("\n"),
            "reader.ts",
        )

        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatchObject({
            kind: "private_identifier",
            name: "fill",
            line: 2,
        })
    })

    it("does not flag interface or object keys named private", () => {
        let errors = findPreferProtectedIssues(
            [
                "export interface Config {",
                "    private?: boolean",
                "}",
                "export let json = { private: true }",
                "",
            ].join("\n"),
            "types.ts",
        )

        expect(errors).toEqual([])
    })

    it("does not flag #__PURE__ comments", () => {
        let errors = findPreferProtectedIssues(
            [
                "export let value = /* #__PURE__ */ Number(1)",
                "",
            ].join("\n"),
            "pure.ts",
        )

        expect(errors).toEqual([])
    })
})

describe("rewritePreferProtected", () => {
    it("rewrites private members to protected and keeps the name", () => {
        let source = [
            "export class Lock {",
            "    private _queue = 1",
            "    private _release(): void {}",
            "    constructor(private readonly address: string) {}",
            "}",
            "",
        ].join("\n")

        expect(rewritePreferProtected(source)).toBe(
            [
                "export class Lock {",
                "    protected _queue = 1",
                "    protected _release(): void {}",
                "    constructor(protected readonly address: string) {}",
                "}",
                "",
            ].join("\n"),
        )
    })

    it("rewrites #name to protected _name on declarations and references", () => {
        let source = [
            "export class Bytes {",
            "    #buffer: Uint8Array",
            "    async #fill(): Promise<void> {}",
            "    #onTimeout = () => this.#buffer",
            "    size(): number {",
            "        return this.#buffer.length",
            "    }",
            "}",
            "",
        ].join("\n")

        expect(rewritePreferProtected(source)).toBe(
            [
                "export class Bytes {",
                "    protected _buffer: Uint8Array",
                "    protected async _fill(): Promise<void> {}",
                "    protected _onTimeout = () => this._buffer",
                "    size(): number {",
                "        return this._buffer.length",
                "    }",
                "}",
                "",
            ].join("\n"),
        )
    })

    it("places protected before get/set on private accessors", () => {
        let source = [
            "export class Pool {",
            "    get #remaining(): number { return 1 }",
            "    set #remaining(value: number) {}",
            "}",
            "",
        ].join("\n")

        expect(rewritePreferProtected(source)).toBe(
            [
                "export class Pool {",
                "    protected get _remaining(): number { return 1 }",
                "    protected set _remaining(value: number) {}",
                "}",
                "",
            ].join("\n"),
        )
    })

    it("does not double-prefix an already underscored #name", () => {
        let source = [
            "export class Box {",
            "    #_value = 1",
            "    get value() { return this.#_value }",
            "}",
            "",
        ].join("\n")

        expect(rewritePreferProtected(source)).toBe(
            [
                "export class Box {",
                "    protected _value = 1",
                "    get value() { return this._value }",
                "}",
                "",
            ].join("\n"),
        )
    })
})

describe("validatePreferProtected", () => {
    it("scans workspace TypeScript files and honors exclude / enabled", async () => {
        let root = await mkdtemp(join(tmpdir(), "yorozu-prefer-protected-"))
        await mkdir(join(root, "src"), { recursive: true })
        await mkdir(join(root, "skip"), { recursive: true })
        await writeFile(
            join(root, "src", "lock.ts"),
            "export class Lock { private _queue = 1 }\n",
        )
        await writeFile(
            join(root, "skip", "ignored.ts"),
            "export class Ignored { #hidden = 1 }\n",
        )

        let errors = await validatePreferProtected({
            workspaceRoot: root,
            config: { preferProtected: { exclude: ["skip/**"] } },
        })
        expect(errors).toHaveLength(1)
        expect(errors[0]?.file).toBe("src/lock.ts")

        let disabled = await validatePreferProtected({
            workspaceRoot: root,
            config: { preferProtected: { enabled: false } },
        })
        expect(disabled).toEqual([])
    })
})
