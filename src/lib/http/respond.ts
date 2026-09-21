import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AuthenticationError } from "@/lib/auth/require-user";

export function errorResponse(error: unknown) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: { code: "unauthorized", message: error.message } }, { status: 401 });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Request validation failed", issues: error.issues } },
      { status: 400 },
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: { code: "internal_error", message: "The request could not be completed" } },
    { status: 500 },
  );
}
