export function unknownToError(err: unknown): Error {
    if (err instanceof Error){
        return err
    }

    if (typeof err === 'string') {
        return new Error(err)
    }

    let error = ""
    try {
        error = JSON.stringify(err)
    } catch (_) {}
    return new Error(error, { cause: err })
}

export class NotImplementedError extends Error {
    constructor(message?:string, options: ErrorOptions = {}) {
        super(`Not implemented${message != null ? `: ${message}` : ''}`, options)
    }
}

export function throwNotImplemented(message?:string, options?: ErrorOptions) : never{
    throw new NotImplementedError(message, options)
}

export function throwUnreachable(): never {
    throw new Error('Unreachable')
}