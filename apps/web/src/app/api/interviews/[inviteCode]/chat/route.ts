export const dynamic = "force-dynamic";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ inviteCode: string }> },
) {
  const { inviteCode } = await params;
  const upstreamResponse = await fetch(
    `${getApiBaseUrl().replace(/\/$/, "")}/v1/public/interviews/${inviteCode}/chat`,
    {
      body: await request.text(),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );

  return new Response(upstreamResponse.body, {
    headers: upstreamResponse.headers,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
  });
}
