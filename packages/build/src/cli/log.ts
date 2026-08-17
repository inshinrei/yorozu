import process from "node:process"

export function info(message: string): void {
    process.stdout.write(`${message}\n`)
}

export function warn(message: string): void {
    process.stderr.write(`${message}\n`)
}

export function error(err: Error): void {
    process.stderr.write(`${err.stack ?? err.message}\n`)
}
