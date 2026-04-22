import { Connection } from "./types"
import { Bytes } from "@yorozu/io"
import { ConditionVariable } from "@yorozu/utils"
import { ConnectionClosedError } from "./errors"

export class FakeConnection<Address = string> implements Connection<Address, Address> {
    private _rx = Bytes.allocate()
    private _tx = Bytes.allocate()
    private _closed = false
    private _cv = new ConditionVariable()

    constructor(private readonly address: Address) {}

    get localAddress(): Address {
        return this.address
    }

    get remoteAddress(): Address {
        return this.address
    }

    close(): void {
        this._closed = true
        this._cv.notify()
    }

    async read(into: Uint8Array): Promise<number> {
        if (this._closed) throw new ConnectionClosedError()
        if (!this._rx.available) await this._cv.wait()
        if (this._closed) throw new ConnectionClosedError()
        return this._rx.read(into)
    }

    async write(bytes: Uint8Array): Promise<void> {
        await this._tx.write(bytes)
        this._cv.notify()
    }

    writeIntoRx(bytes: Uint8Array): void {
        this._rx.writeSync(bytes.length).set(bytes)
        this._cv.notify()
    }

    getTx(): Uint8Array {
        return this._tx.result()
    }
}
