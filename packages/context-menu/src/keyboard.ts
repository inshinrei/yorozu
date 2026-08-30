export const MENU_FOCUSABLE_SELECTOR: string =
    '[role="menuitem"]:not(.disabled):not([aria-disabled="true"]), [role="menuitemcheckbox"]:not(.disabled):not([aria-disabled="true"])'

export function moveMenuFocus(root: HTMLElement, direction: 1 | -1): void {
    let items = Array.from(root.querySelectorAll(MENU_FOCUSABLE_SELECTOR)) as HTMLElement[]
    if (items.length === 0) return

    let activeIndex = items.indexOf(document.activeElement as HTMLElement)
    let nextIndex: number
    if (activeIndex < 0) {
        nextIndex = direction === 1 ? 0 : items.length - 1
    } else {
        nextIndex = Math.min(Math.max(activeIndex + direction, 0), items.length - 1)
    }

    let item = items[nextIndex]!
    item.focus({ preventScroll: true })
    item.scrollIntoView({ block: "nearest" })
}
