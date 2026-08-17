import { noop } from "../misc/noop"

export class Emitter<T> {
    #listeners: ((value: T) => void)[] = []
    #emit: (value: T) => void = noop

    get length(): number {
        return this.#listeners.length
    }

    add(listener: (value: T) => void): void {
        this.#listeners.push(listener)
        this.#updateEmit()
    }

    forwardTo(emitter: Emitter<T>): void {
        this.add(emitter.emit.bind(emitter))
    }

    remove(listener: (value: T) => void): void {
        let idx = this.#listeners.indexOf(listener)
        if (idx === -1) return
        this.#listeners.splice(idx, 1)
        this.#updateEmit()
    }

    emit(value: T): void {
        this.#emit(value)
    }

    once(listener: (value: T) => void): void {
        const once = (value: T): void => {
            this.remove(once)
            listener(value)
        }

        this.add(once)
    }

    listeners(): readonly ((value: T) => void)[] {
        return this.#listeners
    }

    clear(): void {
        this.#listeners.length = 0
        this.#emit = noop
    }

    #emitFew = (value: T): void => {
        let len = this.#listeners.length
        this.#listeners[0](value)

        len > 1 && this.#listeners[1](value)
        len > 2 && this.#listeners[2](value)
        len > 3 && this.#listeners[3](value)
        len > 4 && this.#listeners[4](value)
    }

    #emitAll = (value: T): void => {
        let len = this.#listeners.length
        for (let i = 0; i < len; i++) {
            this.#listeners[i](value)
        }
    }

    #updateEmit = (): void => {
        let len = this.#listeners.length
        if (len === 0) {
            this.#emit = noop
        } else if (len === 1) {
            this.#emit = this.#listeners[0]
        } else if (len <= 5) {
            this.#emit = this.#emitFew
        } else {
            this.#emit = this.#emitAll
        }
    }
}
