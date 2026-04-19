import type {ZodObject} from "zod";
import zod from 'zod'

export interface PackageJson {
    name?: string
    type?: "module" | 'commonjs'
    version?: string
    private?: boolean
    description?: string
    packageManager?: string
    license?: string
    homepage?:string
    repository?: (string | { type: string, url: string })
    keywords?: Array<string>
    catalogs?: Record<string, Record<string, string>>
    workspaces?: Array<string>
    scripts?: Record<string, string>
    dependencies?: Record<string ,string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    bundledDependencies?: Record<string, string>
    engines?: Record<string, string>
    pnpm?: { overrides: Record<string, string> }
    yorozu?: {
        jsr?: 'skip' | 'only'
        npm?: 'skip' | 'only'
        keepScripts?: Array<string>
        distOnlyFields?: Record<string ,unknown>
        ownVersioning?: boolean
        private?: boolean
        standalone?: boolean
    }

    [key: string]: any
}

export const PackageJsonSchema: ZodObject = zod.looseObject({
    name: zod.string(),
    type: zod.union([zod.literal('module'), zod.literal('commonjs')]),
    version: zod.string(),
    private: zod.boolean(),
    description: zod.string(),
    packageManager: zod.string(),
    licence: zod.string(),
    homepage: zod.string(),
    repository: zod.union([zod.string(), zod.object({ type: zod.string(), url: zod.string() })]).transform(val => {
        if (typeof val === 'string') {
            return { type: "git", url: val }
        }
        return val
    }),
    keywords: zod.array(zod.string()),
    workspaces: zod.array(zod.string()),
    scripts: zod.record(zod.string(), zod.string()),
    dependencies: zod.record(zod.string(), zod.string()),
    devDependencies: zod.record(zod.string(), zod.string()),
    peerDependencies: zod.record(zod.string(), zod.string()),
    optionalDependencies: zod.record(zod.string(), zod.string()),
    bundledDependencies: zod.record(zod.string(), zod.string()),
    engines: zod.record(zod.string(), zod.string()),
    pnpm: zod.object({ overrides: zod.record(zod.string(), zod.string()) }).partial(),
    yorozu: zod.object({
        jsr: zod.union([zod.literal('skip'), zod.literal('only')]),
        npm: zod.union([zod.literal('skip'), zod.literal('only')]),
        keepScripts: zod.array(zod.string()),
        distOnlyFields: zod.record(zod.string(), zod.unknown()),
        ownVersioning: zod.boolean(),
        standalone: zod.boolean(),
        private: zod.boolean()
    }).partial(),

    exports: zod.any()
}).partial()