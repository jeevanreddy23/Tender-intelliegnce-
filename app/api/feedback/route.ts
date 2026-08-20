import { NextResponse } from "next/server";

import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { opportunityFeedback } from "../../../db/schema";

const DECISIONS = new Set(["Pursue", "Watch", "Pass"]);
const PASS_REASONS = new Set([
  "Below minimum fee", "Capability gap", "No relationship pathway", "Strong incumbent",
  "Outside operational region", "Insufficient information", "Timing or capacity", "Other",
]);

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const decision = String(payload.decision ?? "");
  const reason = payload.reasonCategory ? String(payload.reasonCategory) : null;
  const tenderId = String(payload.tenderId ?? "").trim();
  const score = Number(payload.scoreAtDecision);
  const tier = String(payload.tierAtDecision ?? "");
  if (!tenderId || !DECISIONS.has(decision) || !Number.isInteger(score) || score < 0 || score > 100 || !["A", "B", "C"].includes(tier)) {
    return NextResponse.json({ error: "Decision, score, or tier is invalid." }, { status: 400 });
  }
  if (decision === "Pass" && (!reason || !PASS_REASONS.has(reason))) {
    return NextResponse.json({ error: "A valid pass reason is required." }, { status: 400 });
  }
  const user = await getChatGPTUser();
  const hostname = new URL(request.url).hostname;
  const userId = user?.email ?? (["localhost", "127.0.0.1"].includes(hostname) ? "local-preview" : null);
  if (!userId) return NextResponse.json({ error: "Sign in is required to store feedback." }, { status: 401 });
  try {
    await (await getDb()).insert(opportunityFeedback).values({
      feedbackId: crypto.randomUUID(),
      tenderId,
      userId,
      decision: decision as "Pursue" | "Watch" | "Pass",
      reasonCategory: reason,
      notes: payload.notes ? String(payload.notes).slice(0, 2000) : null,
      scoreAtDecision: score,
      tierAtDecision: tier as "A" | "B" | "C",
      modelVersion: String(payload.modelVersion ?? "contextual-rules-2.0.0"),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Unable to store opportunity feedback", error);
    return NextResponse.json({ error: "Feedback storage is not configured." }, { status: 503 });
  }
  return NextResponse.json({ stored: true });
}
