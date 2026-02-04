"use client";

import { useState, FormEvent, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole, Clock, Shield } from "lucide-react";

function LoginPageContent() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [totalAttempts, setTotalAttempts] = useState(0);
  // Trigger re-render every second and provide current time
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";

  const isLocked = lockoutUntil > now;

  // Lockout countdown
  useEffect(() => {
    if (!isLocked) {
      return;
    }
    
    const timer = setInterval(() => {
      const currentNow = Date.now();
      setNow(currentNow);
      if (lockoutUntil <= currentNow) {
        setLockoutUntil(0);
        setLoading(false);
        setError("");
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutUntil, isLocked]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLocked) return;
    
    setLoading(true);

    try {
      const credentials = btoa(`:${password}`);
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/json"
        }
      });

      const data = await response.json();

      if (response.ok) {
        router.push(from);
        router.refresh();
      } else {
        setError(data.message || data.error || "Wrong password");
        
        if (data.isLocked && data.lockoutUntil) {
          setLockoutUntil(data.lockoutUntil);
          setLoading(false);
        } else {
          setRemainingAttempts(data.remainingAttempts ?? null);
          setTotalAttempts(data.totalAttempts ?? 0);
          setLoading(false);
        }
      }
    } catch (err) {
      setError("Login failed, please retry");
      setLoading(false);
    }
  }

  const getRemainingTime = () => {
    const remaining = Math.ceil((lockoutUntil - now) / 1000);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background blur effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1e1e1e] via-[#1c1c1c] to-[#1e1e1e]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#DA7756]/10 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-violet-900/10 via-transparent to-transparent" />
      
      {/* Decorative grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="bg-[#1e1e1e]/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-[#3d3d3d]/50 p-8">
          {/* Logo area */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-[#DA7756]/80 rounded-2xl flex items-center justify-center mb-4">
              <LockKeyhole className="w-8 h-8 text-[#E8E0D6]" />
            </div>
            <h1 className="text-2xl font-bold text-[#E8E0D6]">CLIProxyAPI Dashboard</h1>
            <p className="text-[#A39888] mt-2">Please enter password to continue</p>
          </div>

          {/* Login form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#C4BAB0] mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Enter access password"
                className="w-full px-4 py-3 bg-[#2a2a2a]/50 border border-[#4a4540] rounded-lg text-[#E8E0D6] placeholder-[#8A7F72] focus:outline-none focus:ring-2 focus:ring-[#DA7756] focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading || isLocked}
                autoFocus
              />
            </div>

            {/* Message area - use transition to avoid layout jumps */}
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
              (error && !isLocked) || isLocked 
                ? "max-h-32 opacity-100" 
                : "max-h-0 opacity-0 !mt-0"
            }`}>
              <div className="pb-1"> {/* Reserve small spacing at bottom */}
                {error && !isLocked && (
                  <div className="rounded-lg p-3 text-sm bg-amber-500/8 border border-amber-400/30 text-amber-300">
                    <p className="font-medium">{error}</p>
                  </div>
                )}

                {isLocked && (
                  <div className="bg-rose-500/8 border border-rose-400/30 rounded-lg p-4 text-rose-300 flex items-start gap-3">
                    <Shield className="h-5 w-5 mt-0.5 shrink-0 animate-pulse" />
                    <div className="flex-1">
                      <p className="font-semibold mb-1">Account locked</p>
                      <p className="text-sm flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        Remaining time: <span className="font-mono font-semibold">{getRemainingTime()}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !password || isLocked}
              className="w-full py-3 px-4 bg-[#DA7756] text-[#E8E0D6] font-medium rounded-lg hover:bg-[#C4653A] focus:outline-none focus:ring-2 focus:ring-[#DA7756] focus:ring-offset-2 focus:ring-offset-[#1e1e1e] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLocked ? "Account locked" : loading ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[#8A7F72] text-sm mt-6">
          © 2025 CLIProxyAPI Monitor
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#1e1e1e]" />}>
      <LoginPageContent />
    </Suspense>
  );
}
