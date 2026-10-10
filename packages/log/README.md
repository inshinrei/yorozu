# @yorozu/log

Process-global Swift-style logger: `configure`, `init(subsystem, category)`, and callback handlers.

## Setup

Call `configure` once at process start. Pass every handler in that call — there is no `addHandler`. A later `configure` replaces the whole config (omitted keys are unset, not merged).

```ts
import { configure, init, type LogRecord } from "@yorozu/log"

configure({
    level: "info",
    subsystems: {
        db: { level: "error", categories: { sql: { level: "debug" } } },
    },
    handlers: [
        (record: LogRecord) => {
            // host-owned output
        },
    ],
})

let log = init("db", "sql")
log.debug("query", { ms: 12 })
```

`init` caches loggers by subsystem and category. Cached instances read the live config: a later `configure` is visible without calling `init` again. Omitted strings are `""`.

`configure({})` clears handlers and levels.

## Noop rules

- No handlers (omitted or `[]`) ⇒ every log method is a noop and `isEnabled` is always false.
- A disabled level is a noop: no record, no timestamp, no copy of `arguments`.
- Effective minimum: `category.level ?? subsystem.level ?? config.level ?? "trace"`. Missing level with handlers present enables every level.

## Level methods

Levels are lowercase and match method names: `trace`, `debug`, `info`, `notice`, `warning`, `error`, `fault`, `critical`. There is no `.warn`.

`.error` takes a message string. Put the error in `arguments`:

```ts
log.error(err.message, { err })
```

Each emit copies `arguments` (default `{}`) and sets `timestamp` to `Date.now()`. Handler throws are swallowed; a handler that logs again is ignored (depth guard). Dispatch snapshots the handler list.

## `.log`

- `.log("hi")` / `.log("hi", { a: 1 })` ⇒ level `notice`.
- `.log("debug", "hi", { a: 1 })` ⇒ that level when the first argument is a `LogLevel` and the second is a string.
- `.log({ level: "fault" }, "hi", { a: 1 })` ⇒ that level.
- Object form without a valid `level` throws `TypeError`.
- Level form without a msg string throws `TypeError`.
- `.log("debug")` logs the message `"debug"` at notice.

## `reportError`

```ts
import { reportError } from "@yorozu/log"

reportError(log, err)
reportError(log, err, { op: "save" })
```

`Error` ⇒ `.error(err.message, { err, ...extra })`. Anything else ⇒ `.warning("never-happen", { err, ...extra })`.

## `createTestLog`

Isolated capture buffer. Does not read or write the global config. `isEnabled` is true for every level.

```ts
import { createTestLog } from "@yorozu/log"

let log = createTestLog("db", "sql")
log.info("up", { n: 1 })
log.collect() // copy of records
log.clear()
```

## `disabled`

Singleton that never emits, even after `configure`. Use it as a stand-in when a caller must receive a `Logger` and you want silence.
