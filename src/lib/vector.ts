/** pgvector accepts vectors as text literals like `[0.1,0.2,...]`. */
export function toVectorLiteral(values: number[]): string {
  return `[${values.map((v) => (Number.isFinite(v) ? v.toFixed(6) : "0")).join(",")}]`;
}
