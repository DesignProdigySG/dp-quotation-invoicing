import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const FEEDBACK_OWNER_EMAIL = "yuanwen@dp.sg";

export default async function FeedbackPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  if (user.email !== FEEDBACK_OWNER_EMAIL) {
    redirect("/board");
  }

  const { data: feedback } = await supabase
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false });

  const items = await Promise.all(
    (feedback || []).map(async (item) => {
      const signedImageUrls = await Promise.all(
        item.image_paths.map(async (path) => {
          const { data } = await supabase.storage
            .from("feedback-images")
            .createSignedUrl(path, 3600);
          return data?.signedUrl ?? null;
        })
      );
      return { ...item, signedImageUrls: signedImageUrls.filter((url): url is string => !!url) };
    })
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Feedback</h1>
          <p className="subtitle">Everything submitted through the feedback button.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card empty">No feedback yet.</div>
      ) : (
        items.map((item) => (
          <div className="card" key={item.id} style={{ marginBottom: 18 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>{item.submitted_by_email}</strong>
                <div className="subtitle">
                  {item.page_path ? `On ${item.page_path} · ` : ""}
                  {new Date(item.created_at).toLocaleString()}
                </div>
              </div>
            </div>
            <p style={{ whiteSpace: "pre-wrap" }}>{item.message}</p>
            {item.signedImageUrls.length > 0 && (
              <div className="row" style={{ flexWrap: "wrap" }}>
                {item.signedImageUrls.map((url) => (
                  <a href={url} target="_blank" rel="noreferrer" key={url}>
                    <img
                      src={url}
                      alt=""
                      style={{
                        width: 120,
                        height: 120,
                        objectFit: "cover",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                      }}
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
