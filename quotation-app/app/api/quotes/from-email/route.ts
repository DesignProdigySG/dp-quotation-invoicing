import { NextRequest, NextResponse } from "next/server";
import {
  createQuoteFromEmailData,
  type CreateQuoteFromEmailInput,
} from "@/lib/email-quote/createQuoteFromEmailData";

export async function POST(request: NextRequest) {
  const expected = process.env.EMAIL_QUOTE_WEBHOOK_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Partial<CreateQuoteFromEmailInput>;

  try {
    const result = await createQuoteFromEmailData(body as CreateQuoteFromEmailInput);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
