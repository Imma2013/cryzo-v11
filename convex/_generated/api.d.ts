/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as appBackends from "../appBackends.js";
import type * as artifacts from "../artifacts.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as cloudAdmin from "../cloudAdmin.js";
import type * as cloudAuth from "../cloudAuth.js";
import type * as cloudAuthStore from "../cloudAuthStore.js";
import type * as cloudRuntime from "../cloudRuntime.js";
import type * as conversations from "../conversations.js";
import type * as hosting from "../hosting.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as mobileBuilds from "../mobileBuilds.js";
import type * as providerSecrets from "../providerSecrets.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  appBackends: typeof appBackends;
  artifacts: typeof artifacts;
  auth: typeof auth;
  billing: typeof billing;
  cloudAdmin: typeof cloudAdmin;
  cloudAuth: typeof cloudAuth;
  cloudAuthStore: typeof cloudAuthStore;
  cloudRuntime: typeof cloudRuntime;
  conversations: typeof conversations;
  hosting: typeof hosting;
  http: typeof http;
  messages: typeof messages;
  mobileBuilds: typeof mobileBuilds;
  providerSecrets: typeof providerSecrets;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
