export function splitOnce(str: string, separator: string): [string, string] {
    let idx = str.indexOf(separator)
    if (idx === -1) throw new RangeError(`Separator not found: ${separator}.`, { cause: { str, separator } })
    return [str.slice(0, idx), str.slice(idx + separator.length)]
}

export function assertStartsWith<P extends string>(str: string, prefix: P): asserts str is `${P}${string}` {
    if (!str.startsWith(prefix))
        throw new TypeError(`String does not starts with ${prefix}.`, { cause: { str, prefix } })
}

export function assertEndsWith<S extends string>(str: string, suffix: S): asserts str is `${string}${S}` {
    if (!str.endsWith(suffix)) throw new TypeError(`String does not ends with ${suffix}.`, { cause: { str, suffix } })
}

export { assertEndsWith as assertsEndsWith }
