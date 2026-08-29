import type Database from "better-sqlite3"

export type SqliteStatement = {
    run(params?: readonly unknown[]): void
    all<T = Record<string, unknown>>(params?: readonly unknown[]): T[]
    get<T = Record<string, unknown>>(params?: readonly unknown[]): T | undefined
}

export type SqliteHandle = {
    exec(sql: string): void
    prepare(sql: string): SqliteStatement
    transaction<T>(fn: () => T): T
    close(): void
}

function bindArgs(params?: readonly unknown[]): unknown[] {
    return params === undefined ? [] : [...params]
}

/** Wrap a better-sqlite3 Database. Array bind: `stmt.run(...params)`. */
export function wrapBetterSqlite3(db: Database.Database): SqliteHandle {
    return {
        exec(sql: string): void {
            db.exec(sql)
        },
        prepare(sql: string): SqliteStatement {
            let stmt = db.prepare(sql)
            return {
                run(params?: readonly unknown[]): void {
                    stmt.run(...bindArgs(params))
                },
                all<T = Record<string, unknown>>(params?: readonly unknown[]): T[] {
                    return stmt.all(...bindArgs(params)) as T[]
                },
                get<T = Record<string, unknown>>(params?: readonly unknown[]): T | undefined {
                    return stmt.get(...bindArgs(params)) as T | undefined
                },
            }
        },
        transaction<T>(fn: () => T): T {
            return db.transaction(fn)()
        },
        close(): void {
            db.close()
        },
    }
}
