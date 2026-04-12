import { locus } from "../lib/locus.js";

interface BuildResult {
  name: string;
  code: string;
  dockerfile: string;
  requirements: string;
  cost: number;
}

const SYSTEM_PROMPT = `You are an expert API developer. Given a user's plain-English description of an API, you generate a complete, working FastAPI service in Python.

Your output must be valid JSON with this exact structure:
{
  "name": "short_snake_case_name",
  "code": "the full main.py file contents as a single string",
  "requirements": "fastapi\\nuvicorn\\npydantic\\n..."
}

Rules:
- The API must use FastAPI with Pydantic models for input/output validation
- Include a GET /health endpoint returning {"status":"ok"}
- Main endpoint must be POST /run accepting a JSON body
- Use type hints throughout
- Include error handling with HTTPException
- Keep dependencies minimal — only what's needed to implement the logic
- Do NOT include x402 or payment logic — injected separately
- Do NOT include if __name__ == "__main__" blocks
- Make the API actually functional, not a stub
- Escape all quotes and newlines properly so the JSON is valid`;

export async function buildApi(description: string): Promise<BuildResult> {
  // Try Locus wrapped Anthropic first (pays from Locus wallet)
  const locusResult = await callViaLocus(description);
  if (locusResult) return locusResult;

  // Fallback to direct Anthropic API
  return callDirectAnthropic(description);
}

async function callViaLocus(description: string): Promise<BuildResult | null> {
  try {
    const response = await locus.callClaude(
      [
        {
          role: "user",
          content: `Build a FastAPI service for this API:\n\n"${description}"\n\nRespond with ONLY valid JSON, no markdown fences, no explanation.`,
        },
      ],
      "claude-sonnet-4-20250514",
      4096,
      SYSTEM_PROMPT
    );

    if (!response.success || !response.data?.content?.[0]?.text) {
      console.warn("[codegen] Locus wrapped Anthropic failed:", response.error);
      return null;
    }

    const text = response.data.content[0].text;
    return parseCodegenResponse(text);
  } catch (err) {
    console.warn("[codegen] Locus call threw:", err);
    return null;
  }
}

async function callDirectAnthropic(description: string): Promise<BuildResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("No AI available — set LOCUS_API_KEY (claw_...) or ANTHROPIC_API_KEY");
  }

  console.log("[codegen] Falling back to direct Anthropic API");

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
          content: `Build a FastAPI service for this API:\n\n"${description}"\n\nRespond with ONLY valid JSON, no markdown fences, no explanation.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.content[0].text;
  return parseCodegenResponse(text);
}

function parseCodegenResponse(text: string): BuildResult {
  // Strip markdown fences if present
  const cleaned = text
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  const requirements = parsed.requirements || "fastapi\nuvicorn\npydantic";
  const dockerfile = buildDockerfile();

  return {
    name: parsed.name || "unnamed_api",
    code: parsed.code,
    dockerfile,
    requirements,
    cost: 0, // cost tracked by Locus internally
  };
}

function buildDockerfile(): string {
  return `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`;
}
