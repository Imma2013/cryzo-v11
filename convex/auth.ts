import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { EmailVerification } from "./emailVerification";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Password({
      verify: EmailVerification,
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase();

        if (!email) {
          throw new Error("Enter a valid email address.");
        }

        return { email };
      },
    }),
  ],
});
