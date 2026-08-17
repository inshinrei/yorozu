import type { StandardSchemaV1 } from "@standard-schema/spec"
import type { FetchAddon, FetchResult } from "../../types"

/** Thrown by `parsedJson` when Standard Schema validation fails. */
export class SchemaValidationError extends Error {
    constructor(readonly issues: ReadonlyArray<StandardSchemaV1.Issue>) {
        let message = "Schema validation failed"
        for (let issue of issues) {
            message += `: ${issue.message}`
            if (issue.path?.length) {
                let paths: Array<string> = []
                for (let path of issue.path) {
                    if (typeof path === "object") paths.push(String(path.key))
                    else paths.push(String(path))
                }
                message += ` at .${paths.join(".")}`
            }
        }
        super(message)
        this.name = "SchemaValidationError"
    }
}

export interface ParserAddon {
    /** Parse JSON and validate it. Throws `SchemaValidationError` on failure. */
    parsedJson: <T extends StandardSchemaV1>(schema: T) => Promise<StandardSchemaV1.InferOutput<T>>
    /** Parse JSON and validate it, returning the Standard Schema result instead of throwing. */
    safelyParsedJson: <T extends StandardSchemaV1>(
        schema: T,
    ) => Promise<StandardSchemaV1.Result<StandardSchemaV1.InferOutput<T>>>
}

/** Response addon: `parsedJson` / `safelyParsedJson` for any Standard Schema library (zod, valibot, yup, …). */
export function parser(): FetchAddon<object, ParserAddon> {
    return {
        response: {
            async parsedJson(this: FetchResult, schema: StandardSchemaV1) {
                let res = await schema["~standard"].validate(await this.json())
                if (res.issues) throw new SchemaValidationError(res.issues)
                return res.value
            },
            async safelyParsedJson(this: FetchResult, schema: StandardSchemaV1) {
                return schema["~standard"].validate(await this.json())
            },
        },
    }
}
