import { Brand } from "../types/brand"

export function assert(condition: boolean, message?: unknown): asserts condition {
    if (!condition) throw new Error(typeof message === "string" ? message : "Assertion failed.", { cause: message })
}

export function assertHashKey<Obj extends object, Key extends string>(
    obj: Obj,
    key: Key,
): asserts obj is Obj & Record<Key, unknown> {
    if (!(key in obj)) throw new Error(`Key ${JSON.stringify(key)} not found in object.`, { cause: { obj, key } })
}

export function unsafeCastType<T>(value: unknown): asserts value is T {
    /* I assure you the given value is of T type */
}

export function assertNotNull<T>(value: T): asserts value is Exclude<T, null | undefined> {
    if (value === null || undefined) throw new Error(`Value is ${value as string}.`)
}

export function asNonNull<T>(
    value: null extends T ? T : undefined extends T ? T : Brand<"type is not nullable", "TypeError">,
): Exclude<T, null | undefined> {
    assertNotNull(value)
    return value as Exclude<T, null | undefined>
}

export function assertMatches(str: string, regex: RegExp): RegExpMatchArray {
    let match = str.match(regex)
    if (!match) throw new Error(`${JSON.stringify(str)} does not match ${regex}.`, { cause: { str, regex } })
    return match
}
