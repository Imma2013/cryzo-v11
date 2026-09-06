# Security Policy

## Reporting a vulnerability

Please do not publish security vulnerabilities, production credentials, customer data, or exploit details in a public GitHub issue.

Use GitHub's private security-advisory flow for this repository when it is available. If a private reporting channel is unavailable, contact the project maintainer privately before disclosing details publicly.

A useful report includes:

- the affected Cryzo version/commit;
- the affected route, feature, or generated-app boundary;
- reproduction steps that do not expose another user's data;
- expected vs. actual authorization behavior;
- the practical impact;
- suggested remediation when known.

## Secrets

Never commit or paste live provider keys into the repository. This includes Stripe secrets, OAuth client secrets, model-provider keys, Vercel tokens, Convex deployment credentials, App Store Connect keys, Google Play service-account files, and Composio credentials.

If a secret is exposed, revoke/rotate it immediately. Removing a secret from a later commit is not sufficient because it may remain in Git history and external logs.

## Generated applications

Generated projects are untrusted input to Cryzo's build infrastructure. Hosted execution must remain isolated in Vercel Sandbox, file paths must be validated, and provider/platform secrets must remain server-side.
