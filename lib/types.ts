export type ModelPrice = {
  model: string;
  inputPricePer1M: number;
  cachedInputPricePer1M: number;
  outputPricePer1M: number;
};

export type ModelUsage = {
  model: string;
  requests: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
};

export type RouteUsage = {
  route: string;
  requests: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
};

export type UsageSeriesPoint = {
  label: string;
  requests: number;
  tokens: number;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  timestamp?: string;
};

// Time-series token data grouped by route (top N routes + "Other")
export type RouteTokenSeriesPoint = {
  label: string;
  [routeOrOther: string]: number | string; // route names as keys, token counts as values
};

export type UsageOverview = {
  totalRequests: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalReasoningTokens: number;
  totalCachedTokens: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  totalCost: number;
  models: ModelUsage[];
  byDay: UsageSeriesPoint[];
  byHour: UsageSeriesPoint[];
};
