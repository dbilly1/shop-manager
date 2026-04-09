/**
 * Box conversion utilities.
 *
 * A product has a primary unit (kg or units) and an optional box size.
 * units_per_box defines how many primary units fit in one box.
 * null / 0 means box tracking is not configured for this product.
 */

/** Convert boxes → primary units */
export function boxesToPrimary(boxes: number, unitsPerBox: number | null | undefined): number {
  if (!unitsPerBox || unitsPerBox <= 0) return 0
  return boxes * unitsPerBox
}

/** Convert primary units → boxes (fractional) */
export function primaryToBoxes(primary: number, unitsPerBox: number | null | undefined): number {
  if (!unitsPerBox || unitsPerBox <= 0) return 0
  return primary / unitsPerBox
}

/** True if box tracking is configured */
export function hasBoxes(unitsPerBox: number | null | undefined): boolean {
  return !!unitsPerBox && unitsPerBox > 0
}

/** Display stock with box count alongside primary units */
export function formatStockWithBoxes(
  primaryQty: number,
  unitType: string,
  unitsPerBox: number | null | undefined,
): string {
  const primaryLabel = unitType === "kg"
    ? `${primaryQty.toFixed(3)} kg`
    : `${primaryQty} units`

  if (!hasBoxes(unitsPerBox)) return primaryLabel

  const boxes = primaryToBoxes(primaryQty, unitsPerBox)
  const boxLabel = boxes % 1 === 0
    ? `${boxes} box${boxes !== 1 ? "es" : ""}`
    : `${boxes.toFixed(2)} boxes`

  return `${primaryLabel} (${boxLabel})`
}
