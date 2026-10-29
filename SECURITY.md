# Security policy

DebateOwl handles student accounts, debate work, and payments, so security reports are welcome and taken seriously.

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue, pull request, or discussion.

- **Preferred:** use GitHub's [private vulnerability reporting](https://github.com/Programcode/DebateOwl/security/advisories/new) for this repository.
- **Or email** [hello@debateowl.com](mailto:hello@debateowl.com) with "Security" in the subject.

Include what you found, where (URL, endpoint, or file and line), the steps to reproduce it, and what an attacker could do with it. A short proof of concept helps.

You can expect a first reply within 5 working days. Once a fix ships, we're happy to credit you in the release notes if you'd like.

## Scope

In scope:

- The hosted app at [debateowl.com](https://debateowl.com) and its Supabase backend (Auth, database policies, Edge Functions).
- The source code in this repository.

Out of scope:

- Denial-of-service and load testing, spam, and social engineering.
- Findings that need a compromised device or browser.
- Reports from automated scanners without a demonstrated impact.
- Third-party services DebateOwl uses (Supabase, Vercel, Stripe, OpenRouter and others). Report those to the vendor.

## Testing rules

- Use only accounts you created yourself. Never access, change, or delete another user's data; if you reach some by accident, stop and tell us.
- Keep AI usage small, and don't make real payments, refunds, or chargebacks as part of testing.
- Give us a reasonable time to fix an issue before you disclose it publicly.

Testing that follows these rules in good faith will not be treated as abuse.
