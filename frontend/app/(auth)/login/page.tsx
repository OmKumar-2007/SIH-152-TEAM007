"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { NitiNetraMark, NitiNetraWordmark } from "@/components/brand/logo";
import { toast } from "sonner";
import { authApi } from "@/lib/api";
import { saveAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@sih.gov.in");
  const [password, setPassword] = useState("Admin@SIH2026");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.login(email, password);
      saveAuth(data.access_token, data.user);
      toast.success(`Welcome, ${data.user.full_name}`);
      router.push("/dashboard");
    } catch (err: any) {
      // The axios interceptor normalises failures into ApiError, so the useful
      // text is on `message` — reaching into `response.data.detail` here would
      // always miss and fall back to the generic string.
      toast.error(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      {/* Background grid */}
      {/* The grid is drawn from a theme variable rather than a literal: a
          hard-coded slate line is invisible on the dark ground and a smudge on
          the light one. */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--grid-line) 1px,transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex items-center gap-3">
            <NitiNetraMark size={84} className="text-[#1F3A5F] dark:text-ink" />
            <NitiNetraWordmark className="text-[2rem] text-[#1F3A5F] dark:text-ink" />
          </div>
          <p className="text-ink-2 text-sm mt-3">
            Public-discourse intelligence for policy decisions
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-bdr rounded-2xl shadow-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-ink-2 uppercase tracking-widest mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-surface-2 border border-transparent rounded-lg px-4 py-2.5 text-ink text-sm placeholder:text-ink-3 focus:outline-none focus:border-brand/60 transition-colors"
                placeholder="you@sih.gov.in"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-2 uppercase tracking-widest mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-surface-2 border border-transparent rounded-lg px-4 py-2.5 pr-10 text-ink text-sm placeholder:text-ink-3 focus:outline-none focus:border-brand/60 transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-2 transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand hover:opacity-90 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="mt-5 text-xs text-ink-3 text-center">
            Demo credentials are pre-filled above
          </p>
        </div>

        <p className="text-center text-xs text-ink-3 mt-6">
          NitiNetra · Smart India Hackathon 2026
        </p>
      </div>
    </div>
  );
}
