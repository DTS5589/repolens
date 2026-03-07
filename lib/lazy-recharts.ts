export type RechartsModule = typeof import('recharts')

let rechartsPromise: Promise<RechartsModule> | null = null

export function loadRecharts(): Promise<RechartsModule> {
  if (!rechartsPromise) {
    rechartsPromise = import('recharts')
  }
  return rechartsPromise
}
