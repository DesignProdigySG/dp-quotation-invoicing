import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <div className="topnav">
        <div className="brand">Quotations &amp; Invoices</div>
        <nav>
          <Link href="/board">Status board</Link>
          <Link href="/clients">Clients</Link>
          <Link href="/quotes">Quotes</Link>
          <Link href="/invoices">Invoices</Link>
        </nav>
        <div className="right">
          <span>{user?.email}</span>
          <form action={signOut}>
            <button className="btn btn-sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <div className="container">{children}</div>
    </>
  );
}
