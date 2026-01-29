"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getTodayInNY } from "@/lib/date";
import type { DailyPrompt, Pair, Response } from "@/lib/types";

const toneOptions = ["cute", "deep", "goofy"] as const;

export default function TodayPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [pair, setPair] = useState<Pair | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<DailyPrompt | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [tone, setTone] = useState<(typeof toneOptions)[number]>("cute");
  const [lessTherapy, setLessTherapy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const today = useMemo(() => getTodayInNY(), []);

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

  useEffect(() => {
    if (!session?.user) return;
    const cachedPairId = localStorage.getItem("dp_pair_id");
    const cachedJoinCode = localStorage.getItem("dp_join_code");
    if (cachedJoinCode) {
      setJoinCode(cachedJoinCode);
    }

    const loadPair = async () => {
      if (cachedPairId) {
        const { data } = await supabase
          .from("pairs")
          .select()
          .eq("id", cachedPairId)
          .single<Pair>();
        if (data) {
          setPair(data);
          if (!cachedJoinCode) {
            setJoinCode(data.join_code);
            localStorage.setItem("dp_join_code", data.join_code);
          }
          return;
        }
      }

      const { data } = await supabase
        .from("pairs")
        .select()
        .or(`user_a.eq.${session.user.id},user_b.eq.${session.user.id}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<Pair>();

      if (data) {
        setPair(data);
        localStorage.setItem("dp_pair_id", data.id);
        localStorage.setItem("dp_join_code", data.join_code);
        setJoinCode(data.join_code);
      } else {
        setStatus("No pair found. Create or join a pair first.");
      }
    };

    loadPair();
  }, [session]);

  useEffect(() => {
    if (!pair) return;
    const loadToday = async () => {
      const { data: promptData } = await supabase
        .from("daily_prompt")
        .select()
        .eq("pair_id", pair.id)
        .eq("date", today)
        .maybeSingle<DailyPrompt>();

      if (promptData) {
        setPrompt(promptData);
        setTone(promptData.tone as (typeof toneOptions)[number]);
        setLessTherapy(promptData.less_therapy);
      }

      const { data: responsesData } = await supabase
        .from("responses")
        .select()
        .eq("pair_id", pair.id)
        .eq("date", today)
        .returns<Response[]>();

      setResponses(responsesData ?? []);
    };

    loadToday();
  }, [pair, today]);

  const handleGenerate = async () => {
    if (!pair) return;
    setLoading(true);
    setStatus(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone, less_therapy: lessTherapy }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Prompt generation failed.");
      }

      const { data: saved, error } = await supabase
        .from("daily_prompt")
        .upsert(
          {
            pair_id: pair.id,
            date: today,
            tone,
            less_therapy: lessTherapy,
            prompt: data.prompt,
          },
          { onConflict: "pair_id,date" },
        )
        .select()
        .single<DailyPrompt>();

      if (error) {
        throw error;
      }

      setPrompt(saved);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!pair || !session?.user) return;
    if (!answer.trim()) {
      setStatus("Write a one sentence answer first.");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const { error } = await supabase
        .from("responses")
        .upsert(
          {
            pair_id: pair.id,
            date: today,
            user_id: session.user.id,
            answer: answer.trim(),
          },
          { onConflict: "pair_id,date,user_id" },
        );
      if (error) {
        throw error;
      }
      await refreshResponses();
      setAnswer("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save answer.");
    } finally {
      setLoading(false);
    }
  };

  const refreshResponses = async () => {
    if (!pair) return;
    setRefreshing(true);
    const { data } = await supabase
      .from("responses")
      .select()
      .eq("pair_id", pair.id)
      .eq("date", today)
      .returns<Response[]>();
    setResponses(data ?? []);
    setRefreshing(false);
  };

  const currentUserResponse = responses.find(
    (response) => response.user_id === session?.user?.id,
  );
  const bothAnswered = responses.length >= 2;
  const partnerResponse = responses.find(
    (response) => response.user_id !== session?.user?.id,
  );

  if (!session) {
    return (
      <div className="min-h-screen px-6 py-12 sm:px-10">
        <div className="mx-auto max-w-2xl glass rounded-3xl p-8 text-center">
          <h1 className="font-display text-3xl">Sign in first</h1>
          <p className="mt-3 text-sm text-[color:var(--ink-700)]">
            You need to sign in before you can answer today&apos;s prompt.
          </p>
          <button
            type="button"
            onClick={() => router.push("/setup")}
            className="mt-6 rounded-2xl bg-[color:var(--ink-900)] px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
          >
            Go to setup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-12 sm:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--ink-700)]">
            Daily Prompt
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <h1 className="font-display text-4xl sm:text-5xl">Today</h1>
            <div className="text-sm text-[color:var(--ink-700)]">
              {today} · {session.user.email}
            </div>
          </div>
          {joinCode && (
            <div className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm text-[color:var(--ink-700)]">
              Share this join code with your partner:{" "}
              <span className="font-semibold tracking-[0.2em]">{joinCode}</span>
            </div>
          )}
        </header>

        {status && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {status}
          </div>
        )}

        {!pair && (
          <div className="glass rounded-3xl p-8 text-center">
            <p className="text-sm text-[color:var(--ink-700)]">
              You need to create or join a pair first.
            </p>
            <button
              type="button"
              onClick={() => router.push("/setup")}
              className="mt-4 rounded-2xl bg-[color:var(--ink-900)] px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
            >
              Go to setup
            </button>
          </div>
        )}

        {pair && (
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="glass rounded-3xl p-6 sm:p-8">
              <h2 className="font-display text-2xl">Today&apos;s prompt</h2>
              <p className="mt-2 text-sm text-[color:var(--ink-700)]">
                One shared prompt for both of you.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {toneOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={!!prompt}
                    onClick={() => setTone(option)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                      tone === option
                        ? "bg-[color:var(--ink-900)] text-white"
                        : "border border-white/70 bg-white/70 text-[color:var(--ink-700)]"
                    } ${prompt ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <label className="mt-4 flex items-center gap-3 text-sm text-[color:var(--ink-700)]">
                <input
                  type="checkbox"
                  checked={lessTherapy}
                  disabled={!!prompt}
                  onChange={(event) => setLessTherapy(event.target.checked)}
                  className="h-4 w-4 rounded border-white/70 text-[color:var(--rose-500)] accent-[color:var(--rose-500)]"
                />
                Less therapy-ish
              </label>

              <button
                type="button"
                disabled={loading || !!prompt}
                onClick={handleGenerate}
                className="mt-6 w-full rounded-2xl bg-[color:var(--rose-500)] px-6 py-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {prompt ? "Prompt ready" : "Generate today’s prompt"}
              </button>

              <div className="mt-6 rounded-2xl border border-white/70 bg-white/70 p-4 text-base">
                {prompt ? (
                  <p className="text-[color:var(--ink-900)]">{prompt.prompt}</p>
                ) : (
                  <p className="text-sm text-[color:var(--ink-700)]">
                    Generate a prompt to start.
                  </p>
                )}
              </div>
            </section>

            <section className="glass rounded-3xl p-6 sm:p-8">
              <h2 className="font-display text-2xl">Your answer</h2>
              <p className="mt-2 text-sm text-[color:var(--ink-700)]">
                One sentence only. Reveal after both submit.
              </p>

              {!prompt && (
                <div className="mt-6 rounded-2xl border border-dashed border-white/70 bg-white/60 p-4 text-sm text-[color:var(--ink-700)]">
                  Generate a prompt first.
                </div>
              )}

              {prompt && !currentUserResponse && (
                <div className="mt-6">
                  <textarea
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Type one sentence..."
                    className="min-h-[120px] w-full rounded-2xl border border-white/70 bg-white/70 p-4 text-sm outline-none"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleSubmitAnswer}
                    className="mt-4 w-full rounded-2xl bg-[color:var(--ink-900)] px-6 py-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Submit answer
                  </button>
                </div>
              )}

              {prompt && currentUserResponse && !bothAnswered && (
                <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-white/70 bg-white/70 p-4 text-sm text-[color:var(--ink-700)]">
                  <p>Waiting for the other person.</p>
                  <button
                    type="button"
                    onClick={refreshResponses}
                    disabled={refreshing}
                    className="rounded-2xl border border-white/70 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--ink-700)] transition hover:-translate-y-0.5 disabled:opacity-60"
                  >
                    {refreshing ? "Checking..." : "Check again"}
                  </button>
                </div>
              )}

              {prompt && bothAnswered && (
                <div className="mt-6 space-y-4">
                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--ink-700)]">
                      You
                    </p>
                    <p className="mt-2 text-sm">{currentUserResponse?.answer}</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--ink-700)]">
                      Partner
                    </p>
                    <p className="mt-2 text-sm">{partnerResponse?.answer}</p>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
