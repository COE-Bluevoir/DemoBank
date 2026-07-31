export function BankFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-10 text-sm text-[var(--color-ink-subtle)] lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div className="space-y-3">
          <p className="text-lg font-semibold text-[var(--color-ink)]">
            NorthStar Bank
          </p>
          <p className="max-w-md leading-6">
            Banking designed around everyday confidence, digital clarity and
            modern customer support.
          </p>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-[var(--color-ink)]">Products</p>
          <p>Everyday Plus Account</p>
          <p>Cards</p>
          <p>Support</p>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-[var(--color-ink)]">Support</p>
          <p>Digital onboarding</p>
          <p>Application tracking</p>
          <p>Secure document upload</p>
        </div>
      </div>
    </footer>
  );
}
