import { describe, expect, it, vi } from "vitest"
import { ComposedMiddleware, composeMiddlewares, type Middleware } from "./composer"

describe("composeMiddlewares", () => {
    it("executes middlewares in the correct order (left to right)", async () => {
        const order: number[] = []

        const m1: Middleware<{}> = async (_, next) => {
            order.push(1)
            await next({})
        }
        const m2: Middleware<{}> = async (_, next) => {
            order.push(2)
            await next({})
        }
        const m3: Middleware<{}> = async (_, next) => {
            order.push(3)
            await next({})
        }

        const composed = composeMiddlewares([m1, m2, m3])

        await composed({}, async () => {})

        expect(order).toEqual([1, 2, 3])
    })

    it("passes context correctly through the chain", async () => {
        const seen: any[] = []

        const m1: Middleware<any> = async (ctx, next) => {
            seen.push(ctx)
            ctx.step = 1
            await next(ctx)
        }
        const m2: Middleware<any> = async (ctx, next) => {
            seen.push(ctx)
            ctx.step = 2
            await next(ctx)
        }

        const composed = composeMiddlewares([m1, m2])
        const context = { step: 0 }

        await composed(context, async (ctx) => {
            ctx.step = 3
        })

        expect(seen).toHaveLength(2)
        expect(seen[0]).toBe(context)
        expect(seen[1]).toBe(context)
        expect(context.step).toBe(3)
    })

    it("empty middleware array with final handler calls final directly", async () => {
        const final = vi.fn(async () => "done")

        const composed = composeMiddlewares([], final)
        const result = await composed({})

        expect(final).toHaveBeenCalledTimes(1)
        expect(result).toBe("done")
    })

    it("empty middleware array without final returns a no-op middleware", async () => {
        const composed = composeMiddlewares([]) as Middleware<{}>

        const next = vi.fn(async () => "next-called")
        const result = await composed({}, next as any)

        expect(next).toHaveBeenCalledTimes(1)
        expect(result).toBe("next-called")
    })

    it("supports async middleware with await", async () => {
        const order: string[] = []

        const m1: Middleware<{}> = async (_, next) => {
            order.push("m1-start")
            await new Promise((r) => setTimeout(r, 5))
            await next({})
            order.push("m1-end")
        }

        const m2: Middleware<{}> = async (_, next) => {
            order.push("m2-start")
            await next({})
            order.push("m2-end")
        }

        const final = vi.fn(async () => {
            order.push("final")
            return "done"
        })

        const composed = composeMiddlewares([m1, m2], final as any)
        await composed({})

        expect(order).toEqual(["m1-start", "m2-start", "final", "m2-end", "m1-end"])
    })

    it("middleware can short-circuit by not calling next()", async () => {
        const final = vi.fn(async () => "final")

        const m1: Middleware<{}> = async () => "short-circuit" as any

        const composed = composeMiddlewares([m1], final as any)
        const result = await composed({})

        expect(result).toBe("short-circuit")
        expect(final).not.toHaveBeenCalled()
    })

    it("works with different context and return types", async () => {
        type Ctx = { userId: string }
        type Result = { success: boolean }

        const m1: Middleware<Ctx, Result> = async (ctx, next) => {
            ctx.userId = "123"
            return await next(ctx)
        }

        const final: ComposedMiddleware<Ctx, Result> = async (ctx) => ({ success: true, userId: ctx.userId })

        const composed = composeMiddlewares([m1], final)
        const result = await composed({ userId: "" })

        expect(result).toEqual({ success: true, userId: "123" })
    })
})
