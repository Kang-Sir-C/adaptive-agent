import type { Budget } from "./budget-types.js";

export class BudgetManager {
  constructor(private readonly budget: Budget) {}

  canRunParallel(count: number): boolean {
    return count <= this.budget.maxParallelCalls;
  }

  canEscalate(extraCostUnits: number): boolean {
    return this.budget.currentCostUnits + extraCostUnits <= this.budget.maxCostUnits;
  }

  beginRound(): void {
    this.budget.currentRounds += 1;
  }

  recordUsage(costUnits: number): void {
    this.budget.currentCostUnits += costUnits;
  }

  /** Returns a shallow clone to avoid external mutation. */
  snapshot(): Budget {
    return { ...this.budget };
  }

  /** Returns the live budget reference. Use when the caller wants to observe ongoing updates. */
  live(): Budget {
    return this.budget;
  }
}
