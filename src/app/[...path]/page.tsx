import { Workspace } from "@/components/aqua/workspace";
import { Suspense } from "react";
export default async function Page({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return <Suspense fallback={<main>Loading AquaRelay…</main>}><Workspace path={path} /></Suspense>;
}
