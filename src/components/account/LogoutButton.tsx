"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/account/logout", { method: "POST" }).catch(() => undefined);
        router.replace("/");
        router.refresh();
      }}
      style={{ background: "none", border: 0, padding: 0, font: "inherit", fontSize: "14px", color: "#475569", minHeight: "44px" }}
    >
      {busy ? "Logging out..." : "Log out"}
    </button>
  );
}
