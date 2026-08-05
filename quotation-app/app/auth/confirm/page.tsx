import Link from "next/link";
import { confirmAuthLink } from "./actions";

const TYPE_COPY: Record<string, { title: string; body: string; cta: string }> = {
  recovery: {
    title: "Reset your password",
    body: "Click below to continue resetting your password.",
    cta: "Continue",
  },
  email: {
    title: "Confirm your account",
    body: "Click below to confirm your email address and finish creating your account.",
    cta: "Confirm account",
  },
};

export default async function AuthConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;

  if (!token_hash || !type) {
    return (
      <div className="login-wrap">
        <div className="card login-card">
          <h1>Quotations &amp; Invoices</h1>
          <div className="error">That confirmation link is invalid or has expired.</div>
          <p className="subtitle" style={{ marginTop: 18 }}>
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  const copy = TYPE_COPY[type] ?? TYPE_COPY.email;

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>{copy.title}</h1>
        <p className="subtitle">{copy.body}</p>

        <form action={confirmAuthLink}>
          <input type="hidden" name="token_hash" value={token_hash} />
          <input type="hidden" name="type" value={type} />
          {next && <input type="hidden" name="next" value={next} />}

          <div className="actions" style={{ marginTop: 18 }}>
            <button className="btn btn-primary" type="submit">
              {copy.cta}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
