import { NextResponse } from "next/server";
import { assertEnv } from "@/lib/config";
import { getExplorePoints } from "@/lib/queries/explore";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertEnv();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 501 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get("days");
    const maxPointsParam = searchParams.get("maxPoints");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    const days = daysParam ? Number.parseInt(daysParam, 10) : undefined;
    const maxPoints = maxPointsParam ? Number.parseInt(maxPointsParam, 10) : undefined;

    const payload = await getExplorePoints(days, { maxPoints, start, end });
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error("/api/explore failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
