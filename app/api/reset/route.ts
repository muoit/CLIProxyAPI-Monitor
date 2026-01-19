import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { usageRecords } from "@/lib/db/schema";

export async function POST() {
  try {
    await db.delete(usageRecords);
    return NextResponse.json({ success: true, message: "usage_records table cleared" });
  } catch (error) {
    console.error("Failed to reset usage_records:", error);
    return NextResponse.json(
      { success: false, error: "Failed to clear table" },
      { status: 500 }
    );
  }
}
