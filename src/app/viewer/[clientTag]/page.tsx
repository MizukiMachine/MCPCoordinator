import { Suspense } from "react";

import { ClientViewer } from "./viewer.client";

export default async function ViewerPage({ params }: { params: Promise<{ clientTag: string }> }) {
  const { clientTag } = await params;
  return (
    <Suspense fallback={<div className="p-6 text-white">loading…</div>}>
      <ClientViewer clientTag={clientTag} />
    </Suspense>
  );
}
