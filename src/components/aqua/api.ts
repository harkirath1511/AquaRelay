import { normaliseLocations } from "./geo";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error?.message ?? "The request could not be completed.",
    );
  return normaliseLocations(data) as T;
}
export function post<T>(url: string, body: unknown, key?: string) {
  return api<T>(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: key ? { "Idempotency-Key": key } : {},
  });
}
export interface UploadProgress {
  intent?: { mediaId: string; signedUrl: string };
  uploaded?: boolean;
  completed?: boolean;
}
export async function uploadPhoto(
  file: File,
  observationId: string,
  progress: UploadProgress = {},
) {
  if (progress.completed) return;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const sha256 = Array.from(new Uint8Array(digest))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  progress.intent ??= await post<{ mediaId: string; signedUrl: string }>(
    "/api/uploads",
    {
      observationId,
      fileName: file.name,
      contentType: file.type,
      byteSize: file.size,
      sha256,
    },
  );
  if (!progress.uploaded) {
    const result = await fetch(progress.intent.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!result.ok)
      throw new Error(
        "The observation was saved, but its photo could not be uploaded. Retry to attach it.",
      );
    progress.uploaded = true;
  }
  await post(`/api/uploads/${progress.intent.mediaId}/complete`, {});
  progress.completed = true;
}
