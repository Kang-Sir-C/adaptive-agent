export const workflowDefaults = {
  direct: {
    maxRounds: 1,
    maxParallelCalls: 1,
    maxCostUnits: 1.5,
    maxLatencyMs: 5000,
  },
  cheap_first: {
    maxRounds: 2,
    maxParallelCalls: 1,
    maxCostUnits: 2.0,
    maxLatencyMs: 8000,
  },
  compare: {
    maxRounds: 1,
    maxParallelCalls: 2,
    maxCostUnits: 3.0,
    maxLatencyMs: 9000,
  },
};
