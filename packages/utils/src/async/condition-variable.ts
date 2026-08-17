import { NoneToVoidFunction } from "../types"

export class ConditionVariable {
    #resolvers: Array<NoneToVoidFunction> = []

    wait(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.#resolvers.push(resolve)
        })
    }

    notify(): void {
        let resolvers = this.#resolvers
        this.#resolvers = []
        for (let resolve of resolvers) {
            resolve()
        }
    }
}
