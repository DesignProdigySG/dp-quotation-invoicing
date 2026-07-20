import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("name");

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p className="subtitle">Add once, reuse on every quote and invoice.</p>
        </div>
        <Link className="btn btn-primary" href="/clients/new">
          + New client
        </Link>
      </div>

      <div className="card">
        {!clients || clients.length === 0 ? (
          <div className="empty">No clients yet. Add your first one.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Currency</th>
                <th>GST %</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/clients/${c.id}`}>{c.name}</Link>
                  </td>
                  <td>
                    {c.contact_name}
                    {c.contact_name && c.contact_email ? " · " : ""}
                    {c.contact_email}
                  </td>
                  <td>{c.default_currency}</td>
                  <td>{c.default_gst_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
