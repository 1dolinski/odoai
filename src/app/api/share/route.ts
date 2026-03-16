import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SharedLink from "@/models/SharedLink";

export async function GET(req: NextRequest) {
  await connectDB();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const link = await SharedLink.findOne({ linkId: id });
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ link });
}
