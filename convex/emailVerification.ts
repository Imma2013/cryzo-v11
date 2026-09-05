import { Email } from "@convex-dev/auth/providers/Email";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const CODE_SPACE = 1_000_000;
const UINT32_SPACE = 0x1_0000_0000;
const UNBIASED_LIMIT = Math.floor(UINT32_SPACE / CODE_SPACE) * CODE_SPACE;

function generateVerificationCode() {
  const value = new Uint32Array(1);

  do {
    crypto.getRandomValues(value);
  } while (value[0] >= UNBIASED_LIMIT);

  return String(value[0] % CODE_SPACE).padStart(6, "0");
}

export const EmailVerification = Email({
  id: "email-verification",
  apiKey: process.env.AUTH_RESEND_KEY,
  from: process.env.AUTH_EMAIL ?? "Cryzo <onboarding@resend.dev>",
  maxAge: 15 * 60,
  async generateVerificationToken() {
    return generateVerificationCode();
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const apiKey = String(provider.apiKey ?? "");
    const from = process.env.AUTH_EMAIL;

    if (!apiKey || !from) {
      throw new Error(
        "Email verification is not configured. Set AUTH_RESEND_KEY and AUTH_EMAIL in the Convex deployment.",
      );
    }

    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Verify your Cryzo email",
        text: `Your Cryzo verification code is ${token}. It expires in 15 minutes.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#18181b">
          <h1 style="font-size:22px">Verify your Cryzo email</h1>
          <p>Enter this code to finish creating your account:</p>
          <p style="font-size:30px;font-weight:700;letter-spacing:8px">${token}</p>
          <p>This code expires in 15 minutes. If you did not request it, you can ignore this email.</p>
        </div>`,
      }),
    });

    if (!response.ok) {
      console.error("Resend verification email failed", {
        status: response.status,
        body: await response.text(),
      });
      throw new Error("We could not send your verification email. Please try again.");
    }
  },
});
