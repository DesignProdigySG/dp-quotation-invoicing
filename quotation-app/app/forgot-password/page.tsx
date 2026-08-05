import Link from "next/link";
import { requestPasswordReset } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Reset your password</h1>
        <p className="subtitle">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>

        {params.error && <div className="error">{params.error}</div>}
        {params.message && (
          <div className="error" style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}>
            {params.message}
          </div>
        )}

        <form action={requestPasswordReset}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />

          <div className="actions" style={{ marginTop: 18 }}>
            <button className="btn btn-primary" type="submit">
              Send reset link
            </button>
          </div>
        </form>

        <p className="subtitle" style={{ marginTop: 18 }}>
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
