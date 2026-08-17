import { noop } from "../misc/noop"

export class Emitter<T> {
    protected _listeners: ((value: T) => void)[] = []
    protected _emit: (value: T) => void = noop

    get length(): number {
        return this._listeners.length
    }

    add(listener: (value: T) => void): void {
        this._listeners.push(listener)
        this._updateEmit()
    }

    forwardTo(emitter: Emitter<T>): void {
        this.add(emitter.emit.bind(emitter))
    }

    remove(listener: (value: T) => void): void {
        let idx = this._listeners.indexOf(listener)
        if (idx === -1) return
        this._listeners.splice(idx, 1)
        this._updateEmit()
    }

    emit(value: T): void {
        this._emit(value)
    }

    once(listener: (value: T) => void): void {
        const once = (value: T): void => {
            this.remove(once)
            listener(value)
        }

        this.add(once)
    }

    listeners(): readonly ((value: T) => void)[] {
        return this._listeners
    }

    clear(): void {
        this._listeners.length = 0
        this._emit = noop
    }

    protected _emitFew = (value: T): void => {
        let listeners = this._listeners.slice()
        let len = listeners.length
        listeners[0](value)

        len > 1 && listeners[1](value)
        len > 2 && listeners[2](value)
        len > 3 && listeners[3](value)
        len > 4 && listeners[4](value)
    }

    protected _emitAll = (value: T): void => {
        let listeners = this._listeners.slice()
        for (let i = 0; i < listeners.length; i++) {
            listeners[i](value)
        }
    }

    protected _updateEmit = (): void => {
        let len = this._listeners.length
        if (len === 0) {
            this._emit = noop
        } else if (len <= 5) {
            this._emit = this._emitFew
        } else {
            this._emit = this._emitAll
        }
    }
}
