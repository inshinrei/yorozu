export type Middleware<C, R = void> = (ctx: C, next: (ctx: C) => Promise<R>) => Promise<R>
export type ComposedMiddleware<C, R = void> = (ctx: C) => Promise<R>

export function composeMiddlewares<C, R = void>(
    middlewares: Array<Middleware<C, R>>,
    final: ComposedMiddleware<C, R>,
): ComposedMiddleware<C, R>
export function composeMiddlewares<C, R = void>(middlewares: Array<Middleware<C, R>>): Middleware<C, R>
export function composeMiddlewares<C, R = void>(
    middlewares: Array<Middleware<C, R>>,
    final?: ComposedMiddleware<C, R>,
): Middleware<C, R> {
    middlewares = middlewares.slice()
    if (final == null)
        return function (context: C, next: Middleware<C, R>): Promise<R> {
            function dispatch(i: number, ctx: C): Promise<R> {
                let fn = middlewares[i] ?? next
                return fn(ctx, dispatch.bind(null, i + 1))
            }

            return dispatch(0, context)
        }

    middlewares.push(final)
    function dispatch(i: number, ctx: C): Promise<R> {
        let fn = middlewares[i]
        return fn(ctx, boundDispatches[i + 1])
    }

    let boundDispatches: Array<(ctx: C) => Promise<R>> = []
    for (let i = 0; i < middlewares.length; i++) {
        boundDispatches.push(dispatch.bind(null, i))
    }

    return function (context: C): Promise<R> {
        return boundDispatches[0](context)
    }
}
