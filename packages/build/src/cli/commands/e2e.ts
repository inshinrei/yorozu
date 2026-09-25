import picomatch from "picomatch"
import { findChangedFiles } from "../../git/utils"
import { exec } from "../../misc/exec"
import { info } from "../log"
import { bc, resolveWorkspaceRoot } from "./_utils"

export const E2E_PROJECTS: readonly string[] = [
    "confirm-tooltip",
    "context-menu",
    "media-viewer",
    "sortable",
    "virtual-list",
]

const SKIP_CHANGED_E2E = picomatch(["**/*.unit.ts", "**/*.md", "**/dist/**", "**/playground/**"])

const PACKAGE_TO_E2E_PROJECTS: Readonly<Record<string, readonly string[]>> = {
    "confirm-tooltip": ["confirm-tooltip"],
    "context-menu": ["confirm-tooltip", "context-menu"],
    "media-viewer": ["media-viewer"],
    sortable: ["sortable"],
    "virtual-list": ["media-viewer", "virtual-list"],
}

function projectsForChangedFile(file: string): readonly string[] {
    if (SKIP_CHANGED_E2E(file)) return []

    if (
        file.startsWith("e2e/helpers/") ||
        file === "e2e/vite.config.ts" ||
        file.startsWith("e2e/public/") ||
        file === "playwright.config.ts"
    ) {
        return E2E_PROJECTS
    }

    for (let project of E2E_PROJECTS) {
        if (
            file.startsWith(`e2e/tests/${project}`) ||
            file.startsWith(`e2e/src/${project}`) ||
            file === `e2e/${project}.html`
        ) {
            return [project]
        }
    }

    for (let pkg of Object.keys(PACKAGE_TO_E2E_PROJECTS)) {
        if (file.startsWith(`packages/${pkg}/`)) {
            return PACKAGE_TO_E2E_PROJECTS[pkg] ?? []
        }
    }

    return []
}

export function mapChangedFilesToE2eProjects(files: readonly string[]): string[] {
    let selected = new Set<string>()
    for (let file of files) {
        for (let project of projectsForChangedFile(file)) {
            selected.add(project)
        }
    }
    return E2E_PROJECTS.filter((project) => selected.has(project))
}

async function defaultSince(cwd: string): Promise<string> {
    let res = await exec(["git", "merge-base", "origin/main", "HEAD"], {
        cwd,
        throwOnError: false,
    })
    let sha = res.stdout.trim()
    if (res.exitCode === 0 && sha !== "") return sha
    return "HEAD~1"
}

export let e2eCli = bc.command({
    name: "e2e",
    desc: "run Playwright e2e tests",
    options: {
        changed: bc.boolean().desc("run only projects affected by changed files").default(false),
        since: bc.string().desc("git rev to diff against (default: merge-base origin/main HEAD, or HEAD~1)"),
        workspace: bc.string().desc("path to the workspace root (default: cwd)"),
    },
    handler: async (args) => {
        let root = resolveWorkspaceRoot(args.workspace)
        let projects: Array<string>
        if (args.changed) {
            let files = await findChangedFiles({
                since: args.since ?? (await defaultSince(root)),
                cwd: root,
            })
            projects = mapChangedFilesToE2eProjects(files)
            if (projects.length === 0) {
                info("e2e: no projects for changed files")
                return
            }
        } else {
            projects = [...E2E_PROJECTS]
        }

        await exec(["npx", "playwright", "test", ...projects.flatMap((project) => ["--project", project])], {
            cwd: root,
            stdio: "inherit",
            throwOnError: true,
        })
    },
})
