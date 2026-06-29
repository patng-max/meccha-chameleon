import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    version: process.env.npm_package_version ?? "0.0.0",
    environment: process.env.APP_ENV ?? "staging",
    timestamp: new Date().toISOString(),
  });
}
