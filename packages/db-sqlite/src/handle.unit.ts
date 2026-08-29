import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"
import { wrapBetterSqlite3 } from "./handle"

describe("wrapBetterSqlite3", () => {
    it("wraps exec/prepare/transaction/close", () => {
        let raw = new Database(":memory:")
        let h = wrapBetterSqlite3(raw)
        h.exec("CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)")
        h.prepare("INSERT INTO t (id, n) VALUES (?, ?)").run(["a", 1])
        expect(h.prepare("SELECT n FROM t WHERE id = ?").get(["a"])).toEqual({ n: 1 })
        h.transaction(() => {
            h.prepare("INSERT INTO t (id, n) VALUES (?, ?)").run(["b", 2])
        })
        expect(h.prepare("SELECT COUNT(*) AS c FROM t").get()!.c).toBe(2)
        expect(h.prepare("SELECT id FROM t ORDER BY id").all()).toEqual([{ id: "a" }, { id: "b" }])
        h.close()
    })
})
