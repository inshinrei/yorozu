import type { CookieJar, GetCookiesOptions, SetCookieOptions } from "tough-cookie"
import { FetchAddon, FetchMiddleware } from "../types"

export interface ToughCookieAddon {
    /** cookie jar to use, or extended config */
    cookies?:
        | CookieJar
        | {
              jar: CookieJar
              getCookiesOptions?: GetCookiesOptions
              setCookieOptions?: SetCookieOptions
          }
}

function cookieJarMiddleware({
    jar,
    getCookiesOptions,
    setCookieOptions = { ignoreError: true },
}: NonNullable<Exclude<ToughCookieAddon["cookies"], CookieJar>>): FetchMiddleware {
    return async (request, next) => {
        let cookie = await jar.getCookieString(request.url, getCookiesOptions)
        if (cookie) request.headers.append("Cookie", cookie)

        let res = await next(request)

        for (let header of res.headers.getSetCookie()) {
            await jar.setCookie(header, res.url, setCookieOptions)
        }

        return res
    }
}

export function toughCookieAddon(): FetchAddon<ToughCookieAddon, object> {
    return {
        beforeRequest(ctx) {
            if (ctx.options.cookies != null || ctx.baseOptions.cookies != null) {
                let cfg = (ctx.options.cookies ?? ctx.baseOptions.cookies)!
                if (!("jar" in cfg)) {
                    cfg = { jar: cfg }
                }
                ctx.options.middlewares ??= []
                ctx.options.middlewares.push(cookieJarMiddleware(cfg))
            }
        },
    }
}
