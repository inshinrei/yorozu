import { NoneToVoidFunction } from "../types"

export class ConditionVariable {
    protected _resolvers: Array<NoneToVoidFunction> = []

    wait(): Promise<void> {
        return new Promise<void>((resolve) => {
            this._resolvers.push(resolve)
        })
    }

    notify(): void {
        let resolvers = this._resolvers
        this._resolvers = []
        for (let resolve of resolvers) {
            resolve()
        }
    }
}
