import { createFetch, FetchAddon, FetchClient } from "./client"
import * as fetchAddons from "./addons"

export const defaultFetchAddons: [
    FetchAddon<fetchAddons.TimeoutAddon, object>,
    FetchAddon<fetchAddons.QueryAddon, object>,
    FetchAddon<fetchAddons.FormAddon, object>,
    FetchAddon<fetchAddons.MultipartAddon, object>,
    FetchAddon<fetchAddons.RetryAddon, object>,
    FetchAddon<object, fetchAddons.ParserAddon>,
] = [
    /* #__PURE__ */ fetchAddons.timeout(),
    /* #__PURE__ */ fetchAddons.query(),
    /* #__PURE__ */ fetchAddons.form(),
    /* #__PURE__ */ fetchAddons.multipart(),
    /* #__PURE__ */ fetchAddons.retry(),
    /* #__PURE__ */ fetchAddons.parser(),
]

/**
 * the default FetchClient with a reasonable default set of addons
 *
 * you can use this as a base to create your project-specific fetch instance,
 * or use this as is.
 *
 * this is not exported as `fetch` because most of the time you will want to extend it,
 * and exporting it as `fetch` would make them clash in import suggestions,
 * and will also make it prone to subtle bugs.
 *
 * @example
 * ```ts
 * import { fetchBase } from "@yorozu/fetch"
 *
 * const client = fetchBase.extend({
 *   baseUrl: "https://example.com",
 *   headers: { ... },
 *   addons: [ ... ],
 * })
 * ```
 */
export const fetchBase: FetchClient<
    fetchAddons.TimeoutAddon &
        fetchAddons.QueryAddon &
        fetchAddons.FormAddon &
        fetchAddons.MultipartAddon &
        fetchAddons.RetryAddon,
    fetchAddons.ParserAddon
> = /* #__PURE__ */ createFetch({
    addons: defaultFetchAddons,
})
