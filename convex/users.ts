import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getOrCreate = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();

    if (existing) return existing._id;

    return await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
    });
  },
});

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();
  },
});
