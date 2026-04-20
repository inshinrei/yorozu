import { MaybeArray } from "../types"

export function objectKeys<T extends object>(
    obj: T,
): Array<`${keyof T & (string | number | boolean | null | undefined)}`> {
    return Object.keys(obj) as Array<`${keyof T & (string | number | boolean | null | undefined)}`>
}

export function objectEntries<T extends object>(obj: T): Array<[keyof T, T[keyof T]]> {
    return Object.entries(obj) as Array<[keyof T, T[keyof T]]>
}

export function clearUndefinedInPlace<T extends object>(obj: T): void {
    for (const key in obj) {
        if (!Object.hasOwn(obj, key)) continue
        if (obj[key as keyof T] === undefined) {
            delete obj[key as keyof T]
        }
    }
}

export type MergeInsertions<T> = T extends object ? { [K in keyof T]: MergeInsertions<T[K]> } : T

export type DeepMerge<F, S> = MergeInsertions<{
    [K in keyof F | keyof S]: K extends keyof S & keyof F
        ? DeepMerge<F[K], S[K]>
        : K extends keyof S
          ? S[K]
          : K extends keyof F
            ? F[K]
            : never
}>

export interface DeepMergeOptions {
    undefined?: "replace" | "ignore"
    properties?: "replace" | "ignore"
    arrays?: "replace" | "ignore" | "merge"
    objects?: "replace" | "ignore" | "merge"
}

export function deepMerge<T extends object = object>(into: T, from: MaybeArray<T>, options?: DeepMergeOptions): T
export function deepMerge<T extends object = object, S extends object = T>(
    into: T,
    from: MaybeArray<S>,
    options?: DeepMergeOptions,
): DeepMerge<T, S>
export function deepMerge<T extends object = object, S extends object = T>(
    into: T,
    from: MaybeArray<T>,
    options: DeepMergeOptions = {},
): DeepMerge<T, S> {
    if (!Array.isArray(from)) from = [from] as Array<T>
    if (from.length === 0) return into as DeepMerge<T, S>

    const {
        undefined: undefinedStrategy = "ignore",
        properties: propertiesStrategy = "replace",
        arrays: arraysStrategy = "replace",
        objects: objectsStrategy = "merge",
    } = options

    for (let i = 0; i < from.length; i++) {
        const source = from[i]
        for (const key in source) {
            if (!Object.hasOwn(source, key)) continue

            const value = source[key as keyof T]
            const existing = into[key as keyof T]

            if (value === undefined) {
                if (undefinedStrategy === "replace") {
                    ;(into as any)[key] = undefined
                }
                continue
            }

            if (Array.isArray(value)) {
                if (arraysStrategy === "merge" && Array.isArray(existing)) {
                    existing.push(...value)
                } else if (arraysStrategy === "ignore" && existing !== undefined) {
                } else {
                    ;(into as any)[key] = [...value]
                }
                continue
            }

            if (typeof value === "object" && value !== null) {
                if (objectsStrategy === "merge" && typeof existing === "object" && existing !== null) {
                    ;(into as any)[key] = deepMerge(existing as any, value as any, options)
                } else if (objectsStrategy === "ignore" && existing !== undefined) {
                } else {
                    ;(into as any)[key] = { ...value }
                }
                continue
            }

            if (propertiesStrategy === "ignore" && existing !== undefined) {
            } else {
                ;(into as any)[key] = value
            }
        }
    }

    return into as DeepMerge<T, S>
}
