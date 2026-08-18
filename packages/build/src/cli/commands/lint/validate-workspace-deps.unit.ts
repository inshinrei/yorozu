import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { WorkspacePackage } from "../../../package-json/collect-package-jsons"
import type { PackageJson } from "../../../package-json/types"
import { validateWorkspaceDeps } from "./validate-workspace-deps"

function workspacePackage(json: PackageJson, extras: Partial<WorkspacePackage> = {}): WorkspacePackage {
    return {
        path: extras.path ?? `/tmp/${json.name ?? "pkg"}`,
        packageJsonPath: extras.packageJsonPath ?? `/tmp/${json.name ?? "pkg"}/package.json`,
        root: extras.root ?? false,
        json,
    }
}

describe("validateWorkspaceDeps", () => {
    it("accepts the pnpm-workspace fixture with no dependency mismatches", async () => {
        let errors = await validateWorkspaceDeps({
            workspaceRoot: fileURLToPath(new URL("../../../__fixtures__/pnpm-workspace", import.meta.url)),
        })
        expect(errors).toHaveLength(0)
    })

    it("reports no errors when external versions are compatible", async () => {
        let errors = await validateWorkspaceDeps({
            workspaceRoot: "/tmp/ws",
            packages: [
                workspacePackage({
                    name: "@yorozu-fixtures/package-a",
                    dependencies: { chai: "^1.2.3" },
                }),
                workspacePackage({
                    name: "@yorozu-fixtures/package-b",
                    dependencies: { chai: "1.2.4" },
                }),
            ],
        })
        expect(errors).toHaveLength(0)
    })

    it("reports external version mismatches", async () => {
        let errors = await validateWorkspaceDeps({
            workspaceRoot: "/tmp/ws",
            packages: [
                workspacePackage({
                    name: "@yorozu-fixtures/package-a",
                    dependencies: { chai: "^1.2.3" },
                }),
                workspacePackage({
                    name: "@yorozu-fixtures/package-b",
                    dependencies: { chai: "^2.0.0" },
                }),
            ],
        })

        expect(errors).toHaveLength(1)
        expect(errors[0]).toEqual({
            type: "external",
            package: "@yorozu-fixtures/package-b",
            otherPackage: "@yorozu-fixtures/package-a",
            dependency: "chai",
            version: "^2.0.0",
            at: "dependencies",
            otherVersion: "^1.2.3",
        })
    })

    it("requires workspace: protocol for internal dependencies", async () => {
        let errors = await validateWorkspaceDeps({
            workspaceRoot: "/tmp/ws",
            packages: [
                workspacePackage({ name: "@yorozu/utils", version: "0.1.0" }),
                workspacePackage({
                    name: "@yorozu/io",
                    dependencies: { "@yorozu/utils": "^0.1.0" },
                }),
            ],
        })

        expect(errors).toEqual([
            {
                type: "internal",
                package: "@yorozu/io",
                dependency: "@yorozu/utils",
                subtype: "not_workspace_proto",
            },
        ])
    })

    it("allows non-workspace versions for standalone internal dependencies", async () => {
        let errors = await validateWorkspaceDeps({
            workspaceRoot: "/tmp/ws",
            packages: [
                workspacePackage({
                    name: "@yorozu/fetch",
                    version: "0.0.1",
                    yorozu: { standalone: true },
                }),
                workspacePackage({
                    name: "@yorozu/io",
                    dependencies: { "@yorozu/fetch": "^0.0.1" },
                }),
            ],
        })
        expect(errors).toHaveLength(0)
    })

    it("flags workspace: protocol pointing at a missing package", async () => {
        let errors = await validateWorkspaceDeps({
            workspaceRoot: "/tmp/ws",
            packages: [
                workspacePackage({
                    name: "@yorozu/io",
                    dependencies: { "@yorozu/missing": "workspace:^" },
                }),
            ],
        })

        expect(errors).toEqual([
            {
                type: "internal",
                package: "@yorozu/io",
                dependency: "@yorozu/missing",
                subtype: "not_workspace_dep",
            },
        ])
    })

    it("skips external checks when disabled", async () => {
        let errors = await validateWorkspaceDeps({
            workspaceRoot: "/tmp/ws",
            config: { externalDependencies: { enabled: false } },
            packages: [
                workspacePackage({
                    name: "@yorozu-fixtures/package-a",
                    dependencies: { chai: "^1.2.3" },
                }),
                workspacePackage({
                    name: "@yorozu-fixtures/package-b",
                    dependencies: { chai: "^2.0.0" },
                }),
            ],
        })
        expect(errors).toHaveLength(0)
    })

    it("skips peer dependencies when configured", async () => {
        let errors = await validateWorkspaceDeps({
            workspaceRoot: "/tmp/ws",
            config: { externalDependencies: { skipPeerDependencies: true } },
            packages: [
                workspacePackage({
                    name: "@yorozu-fixtures/package-a",
                    peerDependencies: { chai: "^1.2.3" },
                }),
                workspacePackage({
                    name: "@yorozu-fixtures/package-b",
                    peerDependencies: { chai: "^2.0.0" },
                }),
            ],
        })
        expect(errors).toHaveLength(0)
    })
})
