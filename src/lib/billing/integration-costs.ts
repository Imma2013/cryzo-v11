export const INTEGRATION_CREDIT_COSTS = {
  databaseRead: 1,
  databaseWrite: 1,
  databaseDelete: 1,
  realtimeLease: 1,
  fileUpload: 1,
  sendEmail: 1,
  sendCustomDomainEmail: 2,
  sendPushNotification: 1,
  imageGeneration: 1,
  automationRun: 1,
  composioStandardAction: 1,
} as const;

export type IntegrationOperation = keyof typeof INTEGRATION_CREDIT_COSTS;

export function integrationCreditCost(operation: IntegrationOperation) {
  return INTEGRATION_CREDIT_COSTS[operation];
}

export function composioToolCreditCost(toolName?: string | null) {
  // Keep the public economics stable while allowing us to introduce weighted
  // premium tool categories later without changing generated applications.
  if (!toolName) return INTEGRATION_CREDIT_COSTS.composioStandardAction;
  return INTEGRATION_CREDIT_COSTS.composioStandardAction;
}
