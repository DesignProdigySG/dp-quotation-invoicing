import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Quotations &amp; Invoices</h1>
        <p className="subtitle">Sign in with your DP colleague account.</p>

        {params.error && <div className="error">{params.error}</div>}
        {params.message && (
          <div className="error" style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}>
            {params.message}
          </div>
        )}

        <form action={signIn}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />

          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required />

          <div className="actions" style={{ marginTop: 18 }}>
            <button className="btn btn-primary" type="submit">
              Sign in
            </button>
            <button className="btn" type="submit" formAction={signUp}>
              Create account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
