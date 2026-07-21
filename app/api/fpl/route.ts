import { NextRequest, NextResponse } from "next/server";

const BASE = "https://fantasy.premierleague.com/api";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const resource = q.get("resource");
  const id = q.get("id");
  const event = q.get("event");
  let path = "";
  if (resource === "bootstrap") path = "/bootstrap-static/";
  else if (resource === "fixtures") path = "/fixtures/";
  else if (resource === "entry" && /^\d+$/.test(id || "")) path = `/entry/${id}/`;
  else if (resource === "history" && /^\d+$/.test(id || "")) path = `/entry/${id}/history/`;
  else if (resource === "picks" && /^\d+$/.test(id || "") && /^\d+$/.test(event || "")) path = `/entry/${id}/event/${event}/picks/`;
  else return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const upstream = await fetch(`${BASE}${path}`, { headers: { "user-agent": "AssistantManager/1.0" }, next: { revalidate: resource === "bootstrap" ? 900 : 120 } });
  if (!upstream.ok) return NextResponse.json({ error: "FPL request failed" }, { status: upstream.status });
  return NextResponse.json(await upstream.json(), { headers: { "cache-control": "public, max-age=120" } });
}
