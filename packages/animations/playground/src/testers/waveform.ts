import { decodeWaveform, fitWaveform } from "@yorozu/animations"

function encode5bit(values: number[]): Uint8Array {
    let bitCount = values.length * 5
    let bytes = new Uint8Array(Math.ceil(bitCount / 8))
    for (let i = 0; i < values.length; i++) {
        let v = values[i]! & 0x1f
        let bitOffset = i * 5
        for (let b = 0; b < 5; b++) {
            if ((v & (1 << b)) === 0) continue
            let idx = Math.floor((bitOffset + b) / 8)
            let shift = (bitOffset + b) % 8
            bytes[idx]! |= 1 << shift
        }
    }
    return bytes
}

function sampleWave(): number[] {
    let values: number[] = []
    for (let i = 0; i < 48; i++) {
        let envelope = 8 + 12 * Math.abs(Math.sin(i / 4))
        let pulse = i % 7 === 0 ? 10 : 0
        values.push(Math.min(31, Math.round(envelope + pulse)))
    }
    return values
}

export function mountWaveform(root: HTMLElement): () => void {
    let packed = encode5bit(sampleWave())
    let decoded = decodeWaveform(packed)
    let bars = 32

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let toolbar = document.createElement("div")
    toolbar.className = "pg-toolbar"

    let fewer = document.createElement("button")
    fewer.type = "button"
    fewer.className = "pg-btn"
    fewer.textContent = "Fewer bars"

    let more = document.createElement("button")
    more.type = "button"
    more.className = "pg-btn pg-btn-primary"
    more.textContent = "More bars"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Packed 5-bit samples, resampled to the bar count."

    let chart = document.createElement("div")
    chart.className = "pg-wave"
    chart.setAttribute("role", "img")
    chart.setAttribute("aria-label", "Waveform")

    toolbar.append(fewer, more)
    tester.append(toolbar, hint, chart)
    root.append(tester)

    function paint(): void {
        let data = fitWaveform(decoded, bars)
        chart.replaceChildren()
        for (let value of data) {
            let bar = document.createElement("span")
            bar.className = "pg-wave-bar"
            bar.style.height = `${Math.max(8, (value / 31) * 100)}%`
            chart.append(bar)
        }
    }

    fewer.addEventListener("click", () => {
        bars = Math.max(8, bars - 8)
        paint()
    })
    more.addEventListener("click", () => {
        bars = Math.min(64, bars + 8)
        paint()
    })
    paint()

    return () => {
        chart.replaceChildren()
    }
}
