import Link from "next/link";
import { logoutAction } from "@/features/auth/actions";
import OfflineNotice from "@/components/navigation/OfflineNotice";

const links = [
  ["Dashboard", "/dashboard"],
  ["Produtos", "/produtos"],
  ["Estoque", "/estoque"],
  ["Venda", "/vendas"],
  ["Caixa", "/caixa"],
  ["Clientes", "/clientes"],
  ["OS", "/os"],
  ["Configurações", "/configuracoes"]
] as const;

export default function AppShell({
  children,
  name,
  role
}: {
  children: React.ReactNode;
  name: string;
  role: string;
}) {
  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <aside className="hidden w-64 shrink-0 flex-col bg-slate-950 p-5 text-white md:flex">
        <Link href="/dashboard" className="text-xl font-bold">2K Gestão</Link>
        <p className="mt-1 text-sm text-slate-400">2K Celulares</p>
        <nav className="mt-8 flex-1 space-y-1">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-800 pt-4">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-xs capitalize text-slate-400">{role}</p>
          <form action={logoutAction}><button className="mt-3 text-sm text-slate-300 hover:text-white">Sair</button></form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <OfflineNotice />
        <header className="border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <details>
            <summary className="cursor-pointer list-none font-semibold text-slate-900">2K Gestão · Menu</summary>
            <nav className="grid grid-cols-2 gap-2 pt-3">
              {links.map(([label, href]) => (
                <Link key={href} href={href} className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-800">{label}</Link>
              ))}
              <form action={logoutAction}><button className="px-3 py-2 text-left text-sm text-red-700">Sair</button></form>
            </nav>
          </details>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
