import { setHeader } from "../_utils"
import type { FetchAddon } from "../../types"

export interface MultipartAddon {
    /**
     * shorthand for sending a multipart form body,
     * useful for file uploads and similar.
     * mutually exclusive with other body options
     *
     * if multipart is passed in base options, passing one
     * in the request options will override it completely
     */
    multipart?: Record<string, unknown>
}

export interface MultipartAddonOptions {
    /**
     * serializer for the form data.
     * given the form data it should return the body
     *
     * @defaults `FormData`-based serializer (`File`/`Blob` appended as-is; nullish and plain objects skipped)
     */
    serialize?: (data: Record<string, unknown>) => FormData
}

function appendValue(formData: FormData, key: string, value: unknown): void {
    if (value == null) return
    if (value instanceof File) {
        formData.append(key, value, value.name)
        return
    }
    if (value instanceof Blob) {
        formData.append(key, value)
        return
    }
    if (typeof value === "object" || typeof value === "function") return
    formData.append(key, String(value))
}

function defaultSerialize(data: Record<string, unknown>) {
    let formData = new FormData()
    for (let [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
            for (let item of value) appendValue(formData, key, item)
        } else {
            appendValue(formData, key, value)
        }
    }
    return formData
}

export function multipart(options: MultipartAddonOptions = {}): FetchAddon<MultipartAddon, object> {
    let { serialize = defaultSerialize } = options

    return {
        beforeRequest: (ctx) => {
            if (ctx.options.multipart != null || ctx.baseOptions.multipart != null) {
                if (ctx.options.body != null) {
                    throw new Error("Cannot set both multipart and body.")
                }

                let obj = (ctx.options.multipart ?? ctx.baseOptions.multipart)!
                ctx.options.body = serialize(obj)
                ctx.options.method ??= "POST"
                // let fetch set multipart/form-data; boundary=...
                setHeader(ctx.options, "Content-Type", null)
            }
        },
    }
}
