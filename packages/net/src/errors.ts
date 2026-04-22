export class ConnectionClosedError extends Error {
    constructor(message?: string, options?: ErrorOptions) {
        super(`Connection closed${message != null ? message : ""}.`, options)
    }
}

export class ListenerClosedError extends Error {
    constructor() {
        super("Listener closed.")
    }
}
