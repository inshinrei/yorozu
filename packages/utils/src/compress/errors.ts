export class FlateError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options)
        this.name = new.target.name
    }
}

export class UnexpectedEofError extends FlateError {
    constructor(options?: ErrorOptions) {
        super("Unexpected end of DEFLATE stream.", options)
    }
}

export class InvalidBlockTypeError extends FlateError {
    constructor(options?: ErrorOptions) {
        super("Invalid DEFLATE block type.", options)
    }
}

export class InvalidLengthLiteralError extends FlateError {
    constructor(options?: ErrorOptions) {
        super("Invalid DEFLATE length or literal symbol.", options)
    }
}

export class InvalidDistanceError extends FlateError {
    constructor(options?: ErrorOptions) {
        super("Invalid DEFLATE distance.", options)
    }
}

export class InvalidHeaderError extends FlateError {
    constructor(message = "Invalid compressed stream header.", options?: ErrorOptions) {
        super(message, options)
    }
}

export class StreamFinishedError extends FlateError {
    constructor(options?: ErrorOptions) {
        super("Stream already finished.", options)
    }
}

export class ChecksumMismatchError extends FlateError {
    constructor(options?: ErrorOptions) {
        super("Checksum mismatch.", options)
    }
}
