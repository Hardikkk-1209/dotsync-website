export type HealthResponse = {
  ok: boolean;
  service: string;
};

export type DeviceStatus = {
  mode: "mock" | "esp32";
  connected: boolean;
  busy: boolean;
  message: string;
};

export type PracticeResponse = {
  action_id: string;
  state: "queued" | "running" | "completed" | "cancelled" | "failed";
  text: string;
  character_count: number;
  current_index: number;
  current_character: string | null;
  message: string;
};

export type WordSession = {
  session_id: string;
  state: "waiting_for_answer" | "feedback" | "completed" | "cancelled";
  item_index: number;
  item_count: number;
  current_dots: number[];
  outcome: "correct" | "retry" | "uncertain" | null;
  feedback: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");

  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string; detail?: string | { message?: string } }
      | null;
    const detail = typeof payload?.detail === "string" ? payload.detail : payload?.detail?.message;
    throw new Error(payload?.message ?? detail ?? "The local service could not complete that request.");
  }

  return (await response.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>("/api/v1/health"),
  deviceStatus: () => request<DeviceStatus>("/api/v1/device/status"),
  practice: (text: string) =>
    request<PracticeResponse>("/api/v1/practice", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  action: (actionId: string) => request<PracticeResponse>(`/api/v1/actions/${actionId}`),
  cancelAction: (actionId: string) =>
    request<PracticeResponse>(`/api/v1/actions/${actionId}/cancel`, { method: "POST" }),
  resetDevice: () => request<DeviceStatus>("/api/v1/device/reset", { method: "POST" }),
  createWordSession: (word: string) => request<WordSession>("/api/v1/sessions", {
    method: "POST",
    body: JSON.stringify({ word }),
  }),
  advanceWordSession: (sessionId: string) => request<WordSession>(`/api/v1/sessions/${sessionId}/advance`, { method: "POST" }),
  evaluateWordSession: (sessionId: string, answer: string) => request<WordSession>(`/api/v1/sessions/${sessionId}/evaluate`, {
    method: "POST",
    body: JSON.stringify({ answer }),
  }),
  cancelWordSession: (sessionId: string) => request<WordSession>(`/api/v1/sessions/${sessionId}/cancel`, { method: "POST" }),
};
