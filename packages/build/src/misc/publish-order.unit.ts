import { describe, expect, it } from "vitest"
import type { WorkspacePackage } from "../package-json/collect-package-jsons"
import type { PackageJson } from "../package-json/types"
import { determinePublishOrder, sortWorkspaceByPublishOrder } from "./publish-order"

function pkg(
    name: string,
    extras: { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> } = {},
): WorkspacePackage {
    let json: PackageJson = { name, version: "1.0.0", ...extras }
    return {
        path: `/tmp/${name}`,
        packageJsonPath: `/tmp/${name}/package.json`,
        root: false,
        json,
    }
}

describe("determinePublishOrder", () => {
    it("orders a chain so dependencies come before dependents", () => {
        expect(
            determinePublishOrder({
                app: ["lib"],
                lib: ["core"],
                core: [],
            }),
        ).toEqual(["core", "lib", "app"])
    })

    it("orders a diamond so the shared dep is published first", () => {
        expect(
            determinePublishOrder({
                app: ["left", "right"],
                left: ["shared"],
                right: ["shared"],
                shared: [],
            }),
        ).toEqual(["shared", "left", "right", "app"])
    })

    it("ignores missing edges that are not nodes in the graph", () => {
        expect(
            determinePublishOrder({
                app: ["lib", "lodash"],
                lib: ["typescript"],
            }),
        ).toEqual(["lib", "app"])
    })

    it("keeps independent packages in insertion order", () => {
        expect(
            determinePublishOrder({
                a: [],
                b: [],
                c: [],
            }),
        ).toEqual(["a", "b", "c"])
    })

    it("throws on a circular dependency", () => {
        expect(() => {
            determinePublishOrder({
                a: ["b"],
                b: ["c"],
                c: ["a"],
            })
        }).toThrow("Circular dependency detected")
    })
})

describe("sortWorkspaceByPublishOrder", () => {
    it("orders a diamond workspace so the shared package is first", () => {
        let ordered = sortWorkspaceByPublishOrder([
            pkg("app", { dependencies: { left: "workspace:^", right: "workspace:^" } }),
            pkg("left", { dependencies: { shared: "workspace:^" } }),
            pkg("right", { peerDependencies: { shared: "workspace:^" } }),
            pkg("shared"),
        ])

        expect(ordered.map(item => item.json.name)).toEqual(["shared", "left", "right", "app"])
    })

    it("ignores external dependencies that are not in the workspace", () => {
        let ordered = sortWorkspaceByPublishOrder([
            pkg("app", { dependencies: { lib: "workspace:^", lodash: "^4.17.21" } }),
            pkg("lib", { dependencies: { typescript: "catalog:" } }),
        ])

        expect(ordered.map(item => item.json.name)).toEqual(["lib", "app"])
    })
})
