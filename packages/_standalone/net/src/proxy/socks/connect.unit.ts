import type { TCPEndpoint } from "../../types.js"
import type { SocksProxySettings } from "./types.js"
import { SocksProxyConnectionError } from "./types.js"

import { Bytes } from "@yorozu/io"

import { describe, expect, it } from "vitest"
import { buildSocks4Connect, buildSocks5Auth, buildSocks5Connect, buildSocks5Greeting } from "./_protocol.js"
import { performSocksHandshake } from "./connect.js"

describe("performSocksHandshake", () => {
    let endpoint: TCPEndpoint = {
        address: "127.0.0.1",
        port: 8080,
    }

    describe("socks4", () => {
        let proxy = {
            host: "127.0.0.1",
            port: 1080,
            user: "user",
            version: 4,
        } satisfies SocksProxySettings

        it("should connect without auth", async () => {
            let tx = Bytes.allocate()
            let rx = Bytes.from(new Uint8Array([0x00, 0x5a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))

            await performSocksHandshake(rx, tx, proxy, endpoint)

            expect(tx.result()).toEqual(buildSocks4Connect(endpoint, proxy.user))
            expect(rx.available).toBe(0)
        })

        it("should handle incorrect response", async () => {
            let tx = Bytes.allocate()
            let rx = Bytes.from(new Uint8Array([0x01, 0x5a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))

            let promise = performSocksHandshake(rx, tx, proxy, endpoint)

            await expect(promise).rejects.toThrow(SocksProxyConnectionError)
            expect(tx.result()).toEqual(buildSocks4Connect(endpoint, proxy.user))
            expect(rx.available).toBe(0)
        })

        it("should handle incorrect response code", async () => {
            let tx = Bytes.allocate()
            let rx = Bytes.from(new Uint8Array([0x00, 0x5b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))

            let promise = performSocksHandshake(rx, tx, proxy, endpoint)

            await expect(promise).rejects.toThrow(SocksProxyConnectionError)
            expect(tx.result()).toEqual(buildSocks4Connect(endpoint, proxy.user))
            expect(rx.available).toBe(0)
        })
    })

    describe("socks5", () => {
        let proxy = {
            host: "127.0.0.1",
            port: 1080,
            user: "user",
            password: "pass",
        } satisfies SocksProxySettings

        it("should handle incorrect greeting version", async () => {
            let tx = Bytes.allocate()
            let rx = Bytes.from(
                new Uint8Array([...[0x06, 0x02], ...[0x01, 0x00], ...[0x05, 0x00, 0x00, 0x00, 0x00, 0x00]]),
            )

            let promise = performSocksHandshake(rx, tx, proxy, endpoint)

            await expect(promise).rejects.toThrow(SocksProxyConnectionError)
            expect(tx.result()).toEqual(new Uint8Array([...buildSocks5Greeting(true)]))
            expect(rx.available).toBe(8)
        })

        it("should handle incorrect greeting auth method", async () => {
            let tx = Bytes.allocate()
            let rx = Bytes.from(
                new Uint8Array([...[0x05, 0x42], ...[0x01, 0x00], ...[0x05, 0x00, 0x00, 0x00, 0x00, 0x00]]),
            )

            let promise = performSocksHandshake(rx, tx, proxy, endpoint)

            await expect(promise).rejects.toThrow(SocksProxyConnectionError)
            expect(tx.result()).toEqual(new Uint8Array([...buildSocks5Greeting(true)]))
            expect(rx.available).toBe(8)
        })

        it("should handle incorrect auth response version", async () => {
            let tx = Bytes.allocate()
            let rx = Bytes.from(
                new Uint8Array([...[0x05, 0x02], ...[0x02, 0x00], ...[0x05, 0x00, 0x00, 0x00, 0x00, 0x00]]),
            )

            let promise = performSocksHandshake(rx, tx, proxy, endpoint)

            await expect(promise).rejects.toThrow(SocksProxyConnectionError)
            expect(tx.result()).toEqual(
                new Uint8Array([...buildSocks5Greeting(true), ...buildSocks5Auth(proxy.user, proxy.password)]),
            )
            expect(rx.available).toBe(6)
        })

        it("should handle incorrect auth response code", async () => {
            let tx = Bytes.allocate()
            let rx = Bytes.from(
                new Uint8Array([...[0x05, 0x02], ...[0x01, 0x42], ...[0x05, 0x00, 0x00, 0x00, 0x00, 0x00]]),
            )

            let promise = performSocksHandshake(rx, tx, proxy, endpoint)

            await expect(promise).rejects.toThrow(SocksProxyConnectionError)
            expect(tx.result()).toEqual(
                new Uint8Array([...buildSocks5Greeting(true), ...buildSocks5Auth(proxy.user, proxy.password)]),
            )
            expect(rx.available).toBe(6)
        })

        it("should handle incorrect connect response version", async () => {
            let tx = Bytes.allocate()
            let rx = Bytes.from(new Uint8Array([...[0x05, 0x00], ...[0x06, 0x00, 0x00, 0x00, 0x00, 0x00]]))

            let promise = performSocksHandshake(rx, tx, proxy, endpoint)

            await expect(promise).rejects.toThrow(SocksProxyConnectionError)
            expect(tx.result()).toEqual(new Uint8Array([...buildSocks5Greeting(true), ...buildSocks5Connect(endpoint)]))
            expect(rx.available).toBe(2)
        })

        it("should handle incorrect connect response code", async () => {
            let tx = Bytes.allocate()
            let rx = Bytes.from(new Uint8Array([...[0x05, 0x00], ...[0x00, 0x42, 0x00, 0x00, 0x00, 0x00]]))

            let promise = performSocksHandshake(rx, tx, proxy, endpoint)

            await expect(promise).rejects.toThrow(SocksProxyConnectionError)
            expect(tx.result()).toEqual(new Uint8Array([...buildSocks5Greeting(true), ...buildSocks5Connect(endpoint)]))
            expect(rx.available).toBe(2)
        })

        it("should handle incorrect BNDADDR type", async () => {
            let tx = Bytes.allocate()
            let rx = Bytes.from(new Uint8Array([...[0x05, 0x00], ...[0x05, 0x00, 0x00, 0x42, 0x00, 0x00]]))

            let promise = performSocksHandshake(rx, tx, proxy, endpoint)

            await expect(promise).rejects.toThrow(SocksProxyConnectionError)
            expect(tx.result()).toEqual(new Uint8Array([...buildSocks5Greeting(true), ...buildSocks5Connect(endpoint)]))
            expect(rx.available).toBe(2)
        })

        it("should handle ipv4 BNDADDR", async () => {
            let tx = Bytes.allocate()
            let rx = Bytes.from(new Uint8Array([...[0x05, 0x00], ...[0x05, 0x00, 0x00, 0x01, 1, 2, 3, 4, 0x00, 0x00]]))

            await performSocksHandshake(rx, tx, proxy, endpoint)

            expect(tx.result()).toEqual(new Uint8Array([...buildSocks5Greeting(true), ...buildSocks5Connect(endpoint)]))
            expect(rx.available).toBe(0)
        })

        it("should handle ipv6 BNDADDR", async () => {
            let tx = Bytes.allocate()
            let rx = Bytes.from(
                new Uint8Array([
                    ...[0x05, 0x00],
                    ...[0x05, 0x00, 0x00, 0x04, ...Array.from<number>({ length: 18 }).fill(0x42)],
                ]),
            )

            await performSocksHandshake(rx, tx, proxy, endpoint)

            expect(tx.result()).toEqual(new Uint8Array([...buildSocks5Greeting(true), ...buildSocks5Connect(endpoint)]))
            expect(rx.available).toBe(0)
        })
    })
})
