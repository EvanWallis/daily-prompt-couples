"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Pair } from "@/lib/types";

const generateJoinCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
};

export default function SetupPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleMagicLink = async () => {
    setAuthMessage(null);
    if (!email.trim()) {
      setAuthMessage("Add an email first.");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/today`,
      },
    });
    if (error) {
      setAuthMessage(error.message);
      return;
    }
    setAuthMessage("Magic link sent! Check your email.");
  };

  const handleCreatePair = async () => {
    if (!session?.user) return;
    setLoading(true);
    setStatus(null);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateJoinCode();
      const { data, error } = await supabase
        .from("pairs")
        .insert({
          join_code: code,
          user_a: session.user.id,
        })
        .select()
        .single<Pair>();

      if (!error && data) {
        localStorage.setItem("dp_pair_id", data.id);
        localStorage.setItem("dp_join_code", data.join_code);
        router.push("/today");
        return;
      }
    }

    setStatus("Could not create a pair. Try again.");
    setLoading(false);
  };

  const handleJoinPair = async () => {
    if (!session?.user) return;
    if (!joinCode.trim()) {
      setStatus("Enter a join code first.");
      return;
    }
    setLoading(true);
    setStatus(null);

    const { data: pair, error } = await supabase
      .from("pairs")
      .select()
      .eq("join_code", joinCode.trim().toUpperCase())
      .single<Pair>();

    if (error || !pair) {
      setStatus("Join code not found.");
      setLoading(false);
      return;
    }

    if (pair.user_b) {
      setStatus("That pair is already full.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("pairs")
      .update({ user_b: session.user.id })
      .eq("id", pair.id)
      .eq("user_b", null);

    if (updateError) {
      setStatus("Could not join pair. Try again.");
      setLoading(false);
      return;
    }

    localStorage.setItem("dp_pair_id", pair.id);
    localStorage.setItem("dp_join_code", pair.join_code);
    router.push("/today");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <div className="min-h-screen px-6 py-12 sm:px-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--ink-700)]">
            Daily Prompt (Couples)
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">
            Pair up and start the daily prompt ritual.
          </h1>
          <p className="max-w-2xl text-base text-[color:var(--ink-700)]">
            One shared prompt per day. Two one-sentence answers. Reveal only
            after both of you have replied.
          </p>
        </header>

        {!session && (
          <section className="glass rounded-3xl p-6 sm:p-8">
            <h2 className="font-display text-2xl">Sign in</h2>
            <p className="mt-2 text-sm text-[color:var(--ink-700)]">
              Use a magic link to sign in fast.
            </p>
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full flex-1 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm outline-none"
              />
              <button
                type="button"
                onClick={handleMagicLink}
                className="rounded-2xl bg-[color:var(--ink-900)] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
              >
                Send magic link
              </button>
            </div>
            {authMessage && (
              <p className="mt-3 text-sm text-[color:var(--ink-700)]">
                {authMessage}
              </p>
            )}
          </section>
        )}

        {session && (
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="glass rounded-3xl p-6 sm:p-8">
              <h2 className="font-display text-2xl">Create a pair</h2>
              <p className="mt-2 text-sm text-[color:var(--ink-700)]">
                This makes a join code to share with your partner.
              </p>
              <button
                type="button"
                onClick={handleCreatePair}
                disabled={loading}
                className="mt-6 w-full rounded-2xl bg-[color:var(--rose-500)] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-60"
              >
                Create pair
              </button>
            </div>
            <div className="glass rounded-3xl p-6 sm:p-8">
              <h2 className="font-display text-2xl">Join a pair</h2>
              <p className="mt-2 text-sm text-[color:var(--ink-700)]">
                Enter a 6 character code from your partner.
              </p>
              <input
                type="text"
                placeholder="ABC123"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                className="mt-4 w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm tracking-[0.2em] uppercase outline-none"
              />
              <button
                type="button"
                onClick={handleJoinPair}
                disabled={loading}
                className="mt-4 w-full rounded-2xl bg-[color:var(--ink-900)] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-60"
              >
                Join pair
              </button>
            </div>
          </section>
        )}

        {session && (
          <div className="flex items-center justify-between text-sm text-[color:var(--ink-700)]">
            <span>Signed in as {session.user.email}</span>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-full border border-white/70 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]"
            >
              Sign out
            </button>
          </div>
        )}

        {status && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
