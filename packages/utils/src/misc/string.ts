export function splitOnce(str: string, separator: string): [string, string] {
    let idx = str.indexOf(separator)
    if (idx === -1) throw new RangeError(`Separator not found: ${separator}.`, { cause: { str, separator } })
    return [str.slice(0, idx), str.slice(idx + separator.length)]
}

export function assertStartsWith(str: string, prefix: string): asserts str is `${typeof prefix}${string}` {
    if (!str.startsWith(prefix))
        throw new TypeError(`String does not starts with ${prefix}.`, { cause: { str, prefix } })
}

export function assertsEndsWith(str: string, suffix: string): asserts str is `${string}${typeof suffix}` {
    if (!str.endsWith(suffix)) throw new TypeError(`String does not ends with ${suffix}.`, { cause: { str, suffix } })
}
