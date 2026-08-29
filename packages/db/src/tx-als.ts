export type TxAls = {
    getStore(): true | undefined
    run<R>(fn: () => R): R
}

export type TxAlsGate = {
    enter<R>(fn: (als: TxAls) => Promise<R>): Promise<R>
}

type AlsHandle = {
    getStore(): true | undefined
    run<R>(store: true, fn: () => R): R
}

type AlsCtor = new () => AlsHandle

let noopAls: TxAls = {
    getStore(): true | undefined {
        return undefined
    },
    run<R>(fn: () => R): R {
        return fn()
    },
}

function wrapAls(handle: AlsHandle): TxAls {
    return {
        getStore(): true | undefined {
            return handle.getStore()
        },
        run<R>(fn: () => R): R {
            return handle.run(true, fn)
        },
    }
}

function globalAlsCtor(): AlsCtor | undefined {
    let ctor = (globalThis as { AsyncLocalStorage?: AlsCtor }).AsyncLocalStorage
    if (typeof ctor === "function") return ctor
    return undefined
}

let nodeAlsCtorP: Promise<AlsCtor | undefined> | undefined

function loadNodeAlsCtor(): Promise<AlsCtor | undefined> {
    if (nodeAlsCtorP) return nodeAlsCtorP
    if (typeof process === "undefined" || !process.versions?.node) {
        nodeAlsCtorP = Promise.resolve(undefined)
        return nodeAlsCtorP
    }
    // Split the specifier so bundlers cannot statically resolve a node: built-in.
    let spec = ["node", "async_hooks"].join(":")
    nodeAlsCtorP = import(spec).then(
        (mod: { AsyncLocalStorage?: AlsCtor }) =>
            typeof mod.AsyncLocalStorage === "function" ? mod.AsyncLocalStorage : undefined,
        () => undefined,
    )
    return nodeAlsCtorP
}

async function resolveTxAls(): Promise<TxAls> {
    let Global = globalAlsCtor()
    if (Global) return wrapAls(new Global())
    let Node = await loadNodeAlsCtor()
    if (Node) return wrapAls(new Node())
    return noopAls
}

if (typeof process !== "undefined" && process.versions?.node) {
    void loadNodeAlsCtor()
}

export function createTxAls(): TxAlsGate {
    let ready = resolveTxAls()
    return {
        enter<R>(fn: (als: TxAls) => Promise<R>): Promise<R> {
            return ready.then(fn)
        },
    }
}
