export type Budget = {
  maxRounds: number;
  maxParallelCalls: number;
  maxCostUnits: number;
  maxLatencyMs: number;
  currentRounds: number;
  currentParallelCalls: number;
  currentCostUnits: number;
};
