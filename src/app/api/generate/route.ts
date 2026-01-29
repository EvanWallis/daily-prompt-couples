import { NextResponse } from "next/server";

type GeminiResult = {
  prompt: string;
};

const GEMINI_MODEL = "gemini-2.0-flash";

const extractJson = (text: string) => {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1];
  }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text;
};

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GEMINI_API_KEY environment variable." },
      { status: 500 },
    );
  }

  let body: { tone?: string; less_therapy?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const tone = body.tone ?? "cute";
  const lessTherapy = body.less_therapy ?? false;

  const prompt = [
    "You are writing one short relationship prompt for couples.",
    "Return ONLY valid JSON with exactly:",
    '{ "prompt": "..." }',
    "No markdown, no extra keys.",
    "Prompt must be short, answerable in one sentence.",
    `Tone: ${tone}.`,
    lessTherapy
      ? "Avoid therapy language or processing feelings. Keep it playful and casual."
      : "You can be thoughtful and heartfelt, but still simple.",
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 200,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json(
      { error: "Gemini request failed.", detail },
      { status: response.status },
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const raw =
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ??
    "No content returned.";

  try {
    const parsed = JSON.parse(extractJson(raw)) as GeminiResult;
    if (!parsed.prompt) {
      return NextResponse.json(
        { error: "Gemini response missing prompt.", raw },
        { status: 500 },
      );
    }
    return NextResponse.json({ prompt: parsed.prompt.trim() });
  } catch {
    return NextResponse.json(
      { error: "Could not parse Gemini response.", raw },
      { status: 500 },
    );
  }
}
