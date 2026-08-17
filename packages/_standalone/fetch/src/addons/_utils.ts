import { FetchOptions } from "../types"

/** Encode primitives and arrays into `URLSearchParams`; skips nullish values, objects, and functions. */
export function urlencode(query: Record<string, unknown>): URLSearchParams {
    let search = new URLSearchParams()

    for (let [key, value] of Object.entries(query)) {
        if (value == null) continue

        if (Array.isArray(value)) {
            for (let v of value) {
                if (v != null) search.append(key, String(v))
            }
        } else if (typeof value !== "object" && typeof value !== "function") {
            search.set(key, String(value))
        }
    }

    return search
}

/** Set a header on any `HeadersInit` shape. `value === null` deletes the header. */
export function setHeader(options: FetchOptions, key: string, value: string | null): void {
    if (!options.headers) {
        if (value === null) return
        options.headers = { [key]: value }
        return
    }

    let headers = options.headers

    if (headers instanceof Headers) {
        value === null ? headers.delete(key) : headers.set(key, value)
        return
    }

    if (Array.isArray(headers)) {
        if (value === null) {
            options.headers = headers.filter(([k]) => k !== key)
        } else {
            headers.push([key, value])
        }
        return
    }

    if (Symbol.iterator in headers) {
        options.headers = Object.fromEntries(headers as Iterable<[string, string]>)
        headers = options.headers
    }

    let obj = headers as Record<string, string>
    value === null ? delete obj[key] : (obj[key] = value)
}
