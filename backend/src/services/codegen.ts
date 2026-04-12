import { locus } from "../lib/locus.js";

interface BuildResult {
  name: string;
  code: string;
  dockerfile: string;
  cost: number;
}

const SYSTEM_PROMPT = `You are an expert API developer. Given a user's plain-English description of an API, you generate a complete, working FastAPI service in Python.

Your output must be valid JSON with this exact structure:
{
  "name": "short_snake_case_name",
  "code": "the full main.py file contents",
  "requirements": "fastapi\\nuvicorn\\npydantic\\n..."
}

Rules:
- The API must use FastAPI with proper Pydantic models for input/output
- Include proper error handling
- Include a health check endpoint at GET /health
- The main endpoint should be POST /run
- Use type hints everywhere
- Keep dependencies minimal — only what's needed
- Do NOT include any x402 or payment logic — that's injected separately
- Do NOT include if __name__ == "__main__" — uvicorn is started via Dockerfile CMD
- Make the API actually functional and useful, not a stub`;

export async function buildApi(description: string, walletId: string): Promise<BuildResult> {
  let totalCost = 0;

  // Step 1: Call AI to generate the service
  const aiResponse = await locus.callAI(
    "claude-sonnet-4-20250514",
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Build a FastAPI service for this API:\n\n"${description}"\n\nRespond with ONLY valid JSON, no markdown fences.`,
      },
    ],
    walletId
  );

  if (!aiResponse.success) {
    // Fallback to direct Anthropic API if Locus pay-per-use fails
    const result = await fallbackCodegen(description);
    return { ...result, cost: 0 };
  }

  totalCost += aiResponse.data.cost || 0;

  // Parse the AI response
  const parsed = JSON.parse(aiResponse.data.response);

  // Generate Dockerfile
  const dockerfile = generateDockerfile(parsed.requirements || "fastapi\nuvicorn\npydantic");

  return {
    name: parsed.name || "unnamed_api",
    code: parsed.code,
    dockerfile,
    cost: totalCost,
  };
}

function generateDockerfile(requirements: string): string {
  return `FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`;
}

/**
 * Fallback codegen using Anthropic API directly
 * Used when Locus pay-per-use is unavailable
 */
async function fallbackCodegen(description: string): Promise<Omit<BuildResult, "cost">> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("No AI API available — set LOCUS_API_KEY or ANTHROPIC_API_KEY");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Build a FastAPI service for this API:\n\n"${description}"\n\nRespond with ONLY valid JSON, no markdown fences.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.content[0].text;
  const parsed = JSON.parse(text);

  const dockerfile = generateDockerfile(parsed.requirements || "fastapi\nuvicorn\npydantic");

  return {
    name: parsed.name || "unnamed_api",
    code: parsed.code,
    dockerfile,
  };
}
