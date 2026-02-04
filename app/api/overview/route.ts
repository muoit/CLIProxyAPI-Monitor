import { NextResponse } from "next/server";
import { assertEnv, config } from "@/lib/config";
import { getOverview } from "@/lib/queries/overview";

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
    const days = daysParam ? Number.parseInt(daysParam, 10) : undefined;
    const model = searchParams.get("model");
    const route = searchParams.get("route");
    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("pageSize");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    const page = pageParam ? Number.parseInt(pageParam, 10) : undefined;
    const pageSize = pageSizeParam ? Number.parseInt(pageSizeParam, 10) : undefined;

    const { overview, empty, days: appliedDays, meta, filters, topRoutes, tokensByRoute } = await getOverview(days, {
      model: model || undefined,
      route: route || undefined,
      page,
      pageSize,
      start,
      end
    });

    const payload = { overview, empty, days: appliedDays, meta, filters, topRoutes, tokensByRoute, timezone: config.timezone };
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error("/api/overview failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
