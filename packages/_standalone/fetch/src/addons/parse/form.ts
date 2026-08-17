import { setHeader, urlencode } from "../_utils"
import type { FetchAddon } from "../../types"

export interface FormAddon {
    /**
     * shorthand for sending an `application/x-www-form-urlencoded` body,
     * mutually exclusive with other body options
     *
     * if form is passed in base options, passing one
     * in the request options will override it completely
     */
    form?: Record<string, unknown>
}

export interface FormAddonOptions {
    /**
     * serializer for the form data.
     * given the form data it should return the serialized body
     *
     * @defaults `URLSearchParams`-based serializer
     * @example `serialize({ a: 123, b: "hello" }) => "a=123&b=hello"`
     */
    serialize?: (data: Record<string, unknown>) => BodyInit
}

function defaultSerialize(data: Record<string, unknown>): string {
    return urlencode(data).toString()
}

export function form(options: FormAddonOptions = {}): FetchAddon<FormAddon, object> {
    let { serialize = defaultSerialize } = options
    return {
        beforeRequest: (ctx) => {
            if (ctx.options.form != null || ctx.baseOptions.form != null) {
                if (ctx.options.body != null) throw new Error(`Cannot set both form and body.`)
                let obj = (ctx.options.form ?? ctx.baseOptions.form)!
                ctx.options.body = serialize(obj)
                ctx.options.method ??= "POST"
                setHeader(ctx.options, "Content-Type", "application/x-www-form-urlencoded")
            }
        },
    }
}
