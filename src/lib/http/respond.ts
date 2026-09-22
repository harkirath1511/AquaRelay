import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AuthenticationError, AuthorizationError } from "@/lib/auth/require-user";
import { AssessmentConflictError } from "@/features/assessments/repository";
import { UploadLimitError } from "@/features/uploads/repository";
import { LocationReadLimitError } from "@/features/locations/read-quota";

export function errorResponse(error: unknown) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: { code: "unauthorized", message: error.message } }, { status: 401 });
  }

  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: { code: "forbidden", message: error.message } }, { status: 403 });
  }

  if (error instanceof AssessmentConflictError) {
    return NextResponse.json({ error: { code: "assessment_conflict", message: error.message } }, { status: 409 });
  }

  if (error instanceof UploadLimitError) {
    return NextResponse.json({ error: { code: "upload_limit", message: error.message } }, { status: 409 });
  }

  if (error instanceof LocationReadLimitError) {
    return NextResponse.json({ error: { code: "rate_limited", message: error.message } }, { status: 429 });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Request validation failed", issues: error.issues.map(({ code }) => ({ code })) } },
      { status: 400 },
    );
  }

  console.error("Backend request failed");
  return NextResponse.json(
    { error: { code: "internal_error", message: "The request could not be completed" } },
    { status: 500 },
  );
}
