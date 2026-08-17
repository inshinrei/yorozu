export function applyStyles(el: HTMLElement, styles: Record<string, string>): void {
    for (let key in styles) el.style.setProperty(key, styles[key]!)
}

export function clearStyles(el: HTMLElement, keys: readonly string[]): void {
    for (let key of keys) el.style.removeProperty(key)
}
