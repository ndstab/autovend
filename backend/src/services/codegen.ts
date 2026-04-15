import { locus } from "../lib/locus.js";

interface BuildResult {
  name: string;
  code: string;
  dockerfile: string;
  requirements: string;
  cost: number;
  research?: ResearchResult[];
}

interface ResearchResult {
  title: string;
  url: string;
  snippet: string;
}

const SYSTEM_PROMPT = `You are an expert API developer. Given a user's plain-English description of an API, generate a complete, working FastAPI service in Python.

Your output must be valid JSON with EXACTLY this structure:
{
  "name": "short_snake_case_name",
  "code": "the full main.py file contents as a single escaped string",
  "requirements": "fastapi\\nuvicorn\\npydantic"
}

STRICT RULES — violating any will break the deployment:
- Output ONLY the JSON object — no markdown fences, no explanation
- The "code" field must be a single string with \\n for newlines and \\" for quotes
- The "requirements" field: only packages pip can install; fastapi, uvicorn, pydantic are always included
- Include a GET /health endpoint returning {"status": "ok"}
- Main endpoint MUST be POST /run — this is required for the proxy to work
- POST /run must accept a JSON body with a Pydantic model and return JSON
- Use only stdlib + declared requirements — no missing imports
- No if __name__ == "__main__" blocks
- No x402 or payment code
- Implement real logic — not a stub. Use math, string ops, stdlib, or the declared external packages.
- For APIs needing external data (weather, stocks), use the requests library to call a free public API
- Keep requirements minimal: add a package only if it's genuinely needed`;


export async function buildApi(description: string): Promise<BuildResult> {
  // Step A: Research via Exa — best effort; failure does not block codegen.
  const research = await researchViaExa(description);

  // Step B: Try Locus wrapped Anthropic first (pays from Locus wallet)
  const locusResult = await callViaLocus(description, research);
  if (locusResult) return { ...locusResult, research };

  // Step C: Fallback to direct Anthropic API
  const direct = await callDirectAnthropic(description, research);
  return { ...direct, research };
}

/**
 * Exa research step. Queries Locus wrapped Exa for relevant context that the
 * codegen model can cite — e.g. free public APIs, data formats, library hints.
 * Returns [] on any error — never throws. The pipeline should still succeed
 * without research context.
 */
async function researchViaExa(description: string): Promise<ResearchResult[]> {
  try {
    const query = `${description}\n\nfind: public APIs, free data sources, python libraries relevant to building this`;
    const res = await locus.searchExa(query, 4);
    if (!res.success || !res.data?.results) {
      console.warn("[codegen] Exa research failed:", res.error);
      return [];
    }
    return res.data.results.slice(0, 4).map((r) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: (r.text || "").slice(0, 400),
    }));
  } catch (err) {
    console.warn("[codegen] Exa research threw:", err);
    return [];
  }
}

function buildUserPrompt(description: string, research: ResearchResult[]) {
  const researchBlock = research.length
    ? `\n\nResearch context (from Exa search — use if relevant, ignore if not):\n${research
        .map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${r.snippet}`)
        .join("\n\n")}\n`
    : "";

  return `Build a FastAPI service for this API:\n\n"${description}"${researchBlock}\n\nRespond with ONLY valid JSON, no markdown fences, no explanation.`;
}

async function callViaLocus(
  description: string,
  research: ResearchResult[]
): Promise<BuildResult | null> {
  try {
    const response = await locus.callClaude(
      [{ role: "user", content: buildUserPrompt(description, research) }],
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

async function callDirectAnthropic(
  description: string,
  research: ResearchResult[]
): Promise<BuildResult> {
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
      messages: [{ role: "user", content: buildUserPrompt(description, research) }],
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
