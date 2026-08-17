import { readFile } from "node:fs/promises"
import { join } from "node:path"
import picomatch from "picomatch"
import { glob } from "tinyglobby"
import ts from "typescript"
import { normalizeFilePath } from "../../../misc/path"
import type { LintConfig } from "./config"

export interface PreferProtectedError {
    type: "prefer_protected"
    file: string
    line: number
    column: number
    kind: "private_keyword" | "private_identifier"
    name: string
}

interface Replacement {
    start: number
    end: number
    text: string
}

let IGNORE = ["**/node_modules/**", "**/dist/**", "**/__fixtures__/**"]

export function findPreferProtectedIssues(source: string, fileName = "file.ts"): Array<PreferProtectedError> {
    let file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
    let errors: Array<PreferProtectedError> = []

    let visit = (node: ts.Node): void => {
        let privateMod = privateModifier(node)
        if (privateMod) {
            let { line, character } = file.getLineAndCharacterOfPosition(privateMod.getStart(file))
            errors.push({
                type: "prefer_protected",
                file: fileName,
                line: line + 1,
                column: character + 1,
                kind: "private_keyword",
                name: memberName(node),
            })
        }

        if (ts.isPrivateIdentifier(node)) {
            let { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file))
            errors.push({
                type: "prefer_protected",
                file: fileName,
                line: line + 1,
                column: character + 1,
                kind: "private_identifier",
                name: privateIdentifierName(node),
            })
        }

        ts.forEachChild(node, visit)
    }

    visit(file)
    return errors
}

export function rewritePreferProtected(source: string, fileName = "file.ts"): string {
    let file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
    let replacements: Array<Replacement> = []

    let visit = (node: ts.Node): void => {
        let privateMod = privateModifier(node)
        if (privateMod) {
            replacements.push({
                start: privateMod.getStart(file),
                end: privateMod.getEnd(),
                text: "protected",
            })
        }

        if (ts.isPrivateIdentifier(node)) {
            let nextName = protectedName(privateIdentifierName(node))
            replacements.push({
                start: node.getStart(file),
                end: node.getEnd(),
                text: nextName,
            })

            if (isPrivateIdentifierDeclaration(node)) {
                let insertAt = accessibilityInsertPos(node.parent, file)
                replacements.push({
                    start: insertAt,
                    end: insertAt,
                    text: "protected ",
                })
            }
        }

        ts.forEachChild(node, visit)
    }

    visit(file)

    replacements.sort((a, b) => {
        if (a.start !== b.start) return b.start - a.start
        return b.end - a.end
    })

    let result = source
    for (let item of replacements) {
        result = result.slice(0, item.start) + item.text + result.slice(item.end)
    }
    return result
}

export async function validatePreferProtected(params: {
    workspaceRoot: string | URL
    config?: LintConfig
}): Promise<Array<PreferProtectedError>> {
    let workspaceRoot = normalizeFilePath(params.workspaceRoot)
    let { enabled = true, exclude = [] } = params.config?.preferProtected ?? {}
    if (!enabled) return []

    let files = await glob("**/*.ts", {
        cwd: workspaceRoot,
        ignore: IGNORE,
    })

    let isExcluded = exclude.length > 0 ? picomatch(exclude) : null
    let errors: Array<PreferProtectedError> = []

    for (let file of files) {
        if (isExcluded?.(file)) continue
        let source = await readFile(join(workspaceRoot, file), "utf8")
        errors.push(...findPreferProtectedIssues(source, file))
    }

    return errors
}

function privateModifier(node: ts.Node): ts.Modifier | undefined {
    if (!ts.canHaveModifiers(node)) return undefined
    return ts.getModifiers(node)?.find(item => item.kind === ts.SyntaxKind.PrivateKeyword)
}

function memberName(node: ts.Node): string {
    if (ts.isConstructorDeclaration(node)) return "constructor"
    if (
        ts.isParameter(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)
    ) {
        if (ts.isIdentifier(node.name) || ts.isPrivateIdentifier(node.name)) return node.name.text
        return node.name.getText()
    }
    return ""
}

function privateIdentifierName(node: ts.PrivateIdentifier): string {
    return node.text.startsWith("#") ? node.text.slice(1) : node.text
}

function protectedName(name: string): string {
    return name.startsWith("_") ? name : `_${name}`
}

function isPrivateIdentifierDeclaration(node: ts.PrivateIdentifier): boolean {
    let parent = node.parent
    if (
        ts.isPropertyDeclaration(parent) ||
        ts.isMethodDeclaration(parent) ||
        ts.isGetAccessorDeclaration(parent) ||
        ts.isSetAccessorDeclaration(parent)
    ) {
        return parent.name === node
    }
    return false
}

function accessibilityInsertPos(node: ts.Node, file: ts.SourceFile): number {
    if (ts.canHaveModifiers(node)) {
        let modifiers = ts.getModifiers(node)
        if (modifiers && modifiers.length > 0) return modifiers[0].getStart(file)
    }
    if (ts.isMethodDeclaration(node) && node.asteriskToken) {
        return node.asteriskToken.getStart(file)
    }
    if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
        return node.getStart(file)
    }
    if (ts.isPropertyDeclaration(node) || ts.isMethodDeclaration(node)) {
        return node.name.getStart(file)
    }
    return node.getStart(file)
}
