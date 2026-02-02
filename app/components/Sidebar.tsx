"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, FileText, Activity, LogOut, Github, ExternalLink, Settings } from "lucide-react";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/explore", label: "Data Exploration", icon: Activity },
  { href: "/logs", label: "Logs", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings }
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [cpamcLink, setCpamcLink] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadCpamc = async () => {
      try {
        const res = await fetch("/api/management-url", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setCpamcLink(typeof data?.url === "string" ? data.url : null);
      } catch {
        if (!active) return;
        setCpamcLink(null);
      }
    };

    loadCpamc();
    return () => {
      active = false;
    };
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  };

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-56 flex-col border-r border-zinc-800 bg-zinc-950 py-6">
      <div className="px-5">
        <h1 className="text-xl font-bold text-white">CLIProxyAPI</h1>
        <p className="text-sm text-zinc-500">Usage Dashboard</p>
      </div>
      <nav className="mt-8 flex-1 space-y-1 px-3">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors ${
                active
                  ? "bg-indigo-500/20 text-indigo-300"
                  : "text-zinc-400 hover:bg-zinc-800/70 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
        {cpamcLink ? (
          <a
            href={cpamcLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <ExternalLink className="h-5 w-5" />
            Go to CPAMC
          </a>
        ) : null}
      </nav>

      <div className="mt-auto border-t border-zinc-800 px-4 pt-4 pb-2 space-y-3">
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/sxjeru/CLIProxyAPI-Monitor"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center rounded-lg border border-zinc-700 p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          >
            <Github className="h-4 w-4" />
          </a>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {loggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>
    </aside>
  );
}
