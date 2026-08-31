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

// Base44-style core backend: database/auth/users are available on every plan.
export function canUseManagedBackendProvisioning(_plan?: string | null) {
  return true;
}

// Arbitrary server-side code, secrets, webhooks and scheduled backend work are
// the advanced backend layer and begin on Builder.
export function canUseCustomBackendFunctions(plan?: string | null) {
  return atLeast(plan, "builder");
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
    cryzoCloudDatabase: true,
    cryzoCloudAuth: true,
    cryzoCloudUsers: true,
    cryzoCloudRealtime: true,
    managedBrandingRemoval: canRemoveManagedBranding(normalized),
    managedCustomDomains: canUseManagedCustomDomains(normalized),
    managedMobileBuilds: canUseManagedMobileBuilds(normalized),
    managedStoreSubmission: canUseManagedStoreSubmission(normalized),
    managedBackendProvisioning: true,
    customBackendFunctions: canUseCustomBackendFunctions(normalized),
  };
}
