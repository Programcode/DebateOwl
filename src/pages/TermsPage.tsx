export default function TermsPage() {
  const updated = "February 10, 2026";

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>

        <div className="mt-8 space-y-6 text-sm leading-6 text-foreground">
          <section>
            <h2 className="text-lg font-semibold">1. Acceptance</h2>
            <p>
              By using DebateLab, you agree to these Terms. If you do not agree, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Eligibility and Accounts</h2>
            <p>
              You are responsible for your account and activity under it. You must provide accurate account
              information and keep your access credentials secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Acceptable Use</h2>
            <p>
              You may not use DebateLab for unlawful activity, abuse, fraud, attempts to bypass limits/security,
              harassment, or to violate rights of others.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Subscriptions and Billing</h2>
            <p>
              Paid plans may renew automatically unless canceled. Fees are billed through our payment provider.
              Except where required by law, fees are non-refundable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Suspension, Termination, and Service Changes</h2>
            <p>
              We may suspend or terminate any account, or restrict access to any feature, at any time for
              security, abuse, legal, operational, or business reasons. We may also modify, pause, or discontinue
              part or all of the service at any time, with or without notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Content and Intellectual Property</h2>
            <p>
              You retain rights to content you submit, and grant us the rights needed to operate the service. The
              DebateLab software, branding, and site content remain our property or our licensors’ property.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Disclaimers</h2>
            <p>
              DebateLab is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind. AI output may
              be incomplete or incorrect and should be reviewed by you before use.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Limitation of Liability</h2>
            <p>
              To the maximum extent allowed by law, we are not liable for indirect, incidental, special,
              consequential, or punitive damages, or any loss of profits, revenue, data, or goodwill.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Changes to These Terms</h2>
            <p>
              We may update these Terms. Continued use after updates means you accept the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Contact</h2>
            <p>
              For legal requests or support, contact us at your published support channel/email.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
