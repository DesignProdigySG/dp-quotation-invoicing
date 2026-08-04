import { updatePassword } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Set a new password</h1>
        <p className="subtitle">Choose a new password for your account.</p>

        {params.error && <div className="error">{params.error}</div>}

        <form action={updatePassword}>
          <label htmlFor="password">New password</label>
          <input id="password" name="password" type="password" required minLength={6} />

          <label htmlFor="confirmPassword">Confirm new password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required minLength={6} />

          <div className="actions" style={{ marginTop: 18 }}>
            <button className="btn btn-primary" type="submit">
              Update password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
