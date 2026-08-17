import { describe, expect, it } from "vitest"
import { exec, ExecError } from "./exec"

describe("exec", () => {
    it("captures stdout and a zero exit code", async () => {
        let result = await exec(["node", "-e", "process.stdout.write('ok')"])
        expect(result.stdout).toBe("ok")
        expect(result.stderr).toBe("")
        expect(result.exitCode).toBe(0)
    })

    it("rejects with ExecError when throwOnError is set and the command fails", async () => {
        let err = await exec(["node", "-e", "process.exit(2)"], { throwOnError: true }).then(
            () => null,
            value => value,
        )

        expect(err).toBeInstanceOf(ExecError)
        expect((err as ExecError).result.exitCode).toBe(2)
    })
})
