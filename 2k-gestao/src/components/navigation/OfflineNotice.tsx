"use client";

import { useEffect, useState } from "react";

export default function OfflineNotice() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return <div role="status" className="sticky top-0 z-50 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950">Sem conexão · vendas, estoque e caixa estão bloqueados até a conexão voltar.</div>;
}
