# @yorozu/log

halua logger helpers (`makeLog`, silent, test).

## Setup

Logger is optional on public setup. Internally bind a module issue key and never optional-chain:

```ts
import { makeLog, makeSilentLog, type Logger } from "@yorozu/log"

type Setup = {
    log?: Logger
}

// internally:
this.log = makeLog(opts.log ?? makeSilentLog(), "yorozu-example")
```

`makeSilentLog()` has no dispatchers: level methods are no-ops. `.span(label, fn)` still executes `fn` and rethrows.

`.error` only for `Error` instances. Non-errors go through `reportFlowFailure` as `warn("never-happen", { err })`.

## Test helpers

```ts
import { createTestLog, expectFlowStory, makeLog } from "@yorozu/log"

let raw = createTestLog()
let log = makeLog(raw, "yorozu-test")
// ...
expectFlowStory(raw.collect(), "outbox-process", ["start", "done"])
```

`expectFlowStory` exact-matches LDD events on one flow name and drops span children.
