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

// This legacy entitlement is used by the built-in Cryzo URL rename path. Keep
// it open on every plan: my-app.<Cryzo hosting domain> is not a custom domain.
export function canUseManagedCustomDomains(_plan?: string | null) {
  return true;
}

// A real externally registered domain (example.com) follows the Base44-style
// upgrade boundary and starts on Builder.
export function canUseExternalCustomDomains(plan?: string | null) {
  return atLeast(plan, "builder");
}

// App creation and store delivery are not Cryzo subscription gates. Users
// provide their own Expo/store credentials and pay Apple/Google fees directly.
export function canUseManagedMobileBuilds(_plan?: string | null) {
  return true;
}

export function canUseManagedStoreSubmission(_plan?: string | null) {
  return true;
}

export function canUseManagedBackendProvisioning(_plan?: string | null) {
  return true;
}

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
    cryzoCloudRealtime: false,
    managedBrandingRemoval: canRemoveManagedBranding(normalized),
    managedCryzoUrlRename: true,
    managedCustomDomains: canUseExternalCustomDomains(normalized),
    managedMobileBuilds: true,
    managedStoreSubmission: true,
    managedBackendProvisioning: true,
    customBackendFunctions: canUseCustomBackendFunctions(normalized),
  };
}
