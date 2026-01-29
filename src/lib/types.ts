export type Pair = {
  id: string;
  join_code: string;
  user_a: string;
  user_b: string | null;
  created_at: string;
};

export type DailyPrompt = {
  id: string;
  pair_id: string;
  date: string;
  tone: string;
  less_therapy: boolean;
  prompt: string;
  created_at: string;
};

export type Response = {
  id: string;
  pair_id: string;
  date: string;
  user_id: string;
  answer: string;
  created_at: string;
};
