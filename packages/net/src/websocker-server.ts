import { Connection, TCPConnection } from "./types"
import { WebSocketConnectionFramed } from "./websocket"

export interface WebSocketServerConnection extends Connection<TCPConnection> {
    readonly headers: Headers
    readonly url: string
}

export interface WebSocketServerConnectionFramed extends WebSocketConnectionFramed {
    readonly headers: Headers
    readonly url: string
}
