import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AuthenticationError } from "@/lib/auth/require-user";
import { AssessmentConflictError } from "@/features/assessments/repository";

export function errorResponse(error: unknown) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: { code: "unauthorized", message: error.message } }, { status: 401 });
  }

  if (error instanceof AssessmentConflictError) {
    return NextResponse.json({ error: { code: "assessment_conflict", message: error.message } }, { status: 409 });
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
