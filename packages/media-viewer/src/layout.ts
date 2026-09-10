/**
 * Stage content box + fit helpers for media layout.
 * Fit math comes from @yorozu/animations — do not duplicate.
 */

export { fitContain } from "@yorozu/animations"

/**
 * Available content box inside a padded stage (client size minus padding).
 */
export function stageContentSize(
    clientWidth: number,
    clientHeight: number,
    padding: { top: number; right: number; bottom: number; left: number },
): { width: number; height: number } {
    let width = Math.max(0, clientWidth - padding.left - padding.right)
    let height = Math.max(0, clientHeight - padding.top - padding.bottom)
    return { width, height }
}
