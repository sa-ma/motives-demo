import { createApiClient } from "@motives-ai/contracts/client";

export const browserApiClient = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
});

