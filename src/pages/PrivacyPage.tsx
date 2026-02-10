export default function PrivacyPage() {
  const updated = "February 10, 2026";

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>

        <div className="mt-8 space-y-6 text-sm leading-6 text-foreground">
          <section>
            <h2 className="text-lg font-semibold">1. Information We Collect</h2>
            <p>
              We collect account information (such as email and profile data), usage data, and content you submit
              to the service (for example prompts, generated outputs, and saved items).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. How We Use Information</h2>
            <p>
              We use information to provide and improve DebateLab, authenticate users, secure the platform,
              process payments, enforce policies, and comply with legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Sharing</h2>
            <p>
              We may share data with infrastructure, analytics, and payment processors that help run the service.
              We may also disclose data when required by law or to protect users, the platform, or our rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Data Retention</h2>
            <p>
              We retain data as needed to operate the service, resolve disputes, enforce agreements, and satisfy
              legal requirements. We may delete or anonymize data when no longer needed.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Security</h2>
            <p>
              We use reasonable technical and organizational safeguards, but no system is perfectly secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Your Controls</h2>
            <p>
              You may request account/data changes or deletion subject to legal and operational limits. You can also
              stop using the service at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Service Control and Enforcement</h2>
            <p>
              For safety, abuse prevention, legal compliance, or operational reasons, we may monitor usage metadata
              and may suspend, restrict, or terminate accounts at our discretion.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Children</h2>
            <p>
              DebateLab is not directed to children under 13 (or applicable minimum age in your jurisdiction).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy. Continued use after updates means you accept the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Contact</h2>
            <p>
              For privacy requests, contact us at your published support channel/email.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
