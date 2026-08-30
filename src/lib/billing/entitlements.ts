export type CryzoPlan = "free" | "starter" | "builder" | "pro" | "elite";

const PLAN_RANK: Record<CryzoPlan, number> = {
  free: 0,
  starter: 1,
  builder: 2,
  pro: 3,
  elite: 4,
};

export function normalizeCryzoPlan(plan?: string | null): CryzoPlan {
  if (plan === "starter" || plan === "builder" || plan === "pro" || plan === "elite") {
    return plan;
  }
  // Legacy values from the previous Cryzo pricing model.
  if (plan === "pro_plus" || plan === "business") return "builder";
  return "free";
}

export function atLeast(plan: string | null | undefined, required: CryzoPlan) {
  return PLAN_RANK[normalizeCryzoPlan(plan)] >= PLAN_RANK[required];
}

export function canRemoveManagedBranding(plan?: string | null) {
  return atLeast(plan, "starter");
}

export function canUseManagedCustomDomains(plan?: string | null) {
  return atLeast(plan, "starter");
}

export function canUseManagedMobileBuilds(plan?: string | null) {
  return atLeast(plan, "builder");
}

export function canUseManagedStoreSubmission(plan?: string | null) {
  return atLeast(plan, "builder");
}

export function canUseManagedBackendProvisioning(plan?: string | null) {
  return atLeast(plan, "starter");
}

export function entitlementSnapshot(plan?: string | null) {
  const normalized = normalizeCryzoPlan(plan);
  return {
    plan: normalized,
    unlimitedProjects: true,
    freeModelAccess: true,
    byok: true,
    sourceExport: true,
    githubSync: true,
    diyDeployments: true,
    storeReadinessScan: true,
    managedBrandingRemoval: canRemoveManagedBranding(normalized),
    managedCustomDomains: canUseManagedCustomDomains(normalized),
    managedMobileBuilds: canUseManagedMobileBuilds(normalized),
    managedStoreSubmission: canUseManagedStoreSubmission(normalized),
    managedBackendProvisioning: canUseManagedBackendProvisioning(normalized),
  };
}
