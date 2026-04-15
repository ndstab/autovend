import { locus } from "../lib/locus.js";

interface BuildResult {
  name: string;
  code: string;
  dockerfile: string;
  requirements: string;
  cost: number;
  input_schema?: Record<string, unknown>;
  input_example?: Record<string, unknown>;
  research?: ResearchResult[];
}

interface ResearchResult {
  title: string;
  url: string;
  snippet: string;
}

const SYSTEM_PROMPT = `You are an expert API developer AND a data reliability engineer.

Your job is to convert a user's plain-English API description into a production-quality FastAPI service that is correct, predictable, well-structured, and honest when uncertain.

========================
OUTPUT FORMAT (STRICT)
========================

Return ONLY valid JSON (no markdown, no prose, no code fences) with EXACTLY this structure:

{
  "name": "short_snake_case_name",
  "description": "1-2 sentence clear description",
  "input_schema": {
    "type": "object",
    "properties": {
      "field_name": { "type": "string", "description": "what this field is" }
    },
    "required": ["field_name"]
  },
  "input_example": { "field_name": "realistic sample value" },
  "code": "escaped Python source for main.py",
  "requirements": "fastapi\\nuvicorn\\npydantic"
}

Both "input_schema" and "input_example" are REQUIRED. The example must be a minimal, realistic request body that will actually work against POST /run.

========================
CODE REQUIREMENTS
========================

The "code" field MUST:
* Be a single string (escape newlines as \\n, quotes as \\")
* Define \`app = FastAPI(...)\`
* Expose \`GET /health\` returning {"status": "ok"}
* Expose \`POST /run\` accepting a Pydantic model whose fields match input_schema exactly (field names, types, required/optional)
* Return structured JSON from /run — never a bare string
* Handle errors with try/except and return a JSON body with an "error" key on failure (never let unhandled exceptions escape)
* Import only stdlib + anything listed in "requirements" — if you use \`requests\` or \`httpx\`, add it to requirements

========================
ANTI-HALLUCINATION RULES (VERY IMPORTANT)
========================

NEVER fabricate real-world facts (companies, prices, people, statistics).

If the API depends on real-world knowledge:
* Call a free public API with no auth (Wikipedia REST, DuckDuckGo IA, open-meteo, restcountries, exchangerate.host, etc.)
* If the API is unavailable or returns nothing, respond with {"result": null, "confidence": 0.0, "source": "unknown", "error": "insufficient data"}

Do NOT:
* Invent competitors, salaries, ratings, or numeric values
* Pretend to have current data the LLM can't verify
* Guess a fact and present it as truth

Do:
* Return structured output: { "result": ..., "confidence": 0.0-1.0, "source": "computed"|"external_api"|"heuristic", "notes": "..." }
* Normalize inputs (trim + lowercase where appropriate)
* Handle empty / malformed inputs gracefully

========================
EXTERNAL DATA RULES
========================

If you need external knowledge, add \`requests\` (or \`httpx\`) to requirements and prefer:
* https://en.wikipedia.org/api/rest_v1/page/summary/{title}
* https://api.duckduckgo.com/?q={q}&format=json&no_html=1
* https://api.exchangerate.host
* https://restcountries.com/v3.1
* https://api.open-meteo.com/v1

Do NOT: scrape HTML, call paid APIs, or use endpoints that require API keys.

Set a short timeout (e.g. 6 seconds) on every outbound request, wrap it in try/except, and degrade gracefully on failure.

========================
QUALITY BAR
========================

* Deterministic whenever possible — same input → same output
* Explainable — include confidence + source fields
* Safe — no shell commands, no file writes, no eval

========================
FINAL CHECK BEFORE RETURNING JSON
========================

1. Does input_schema match the Pydantic model in code exactly?
2. Does input_example validate against input_schema?
3. Will the code run with ONLY the listed requirements?
4. Are there zero hallucinated real-world facts in the code?
5. Does /run always return JSON, even on failure?

Only then return the JSON.
`;



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

  const parsed = JSON.parse(cleaned) as {
    name?: string;
    code: string;
    requirements?: string;
    input_schema?: Record<string, unknown>;
    input_example?: Record<string, unknown>;
  };

  const requirements = parsed.requirements || "fastapi\nuvicorn\npydantic";
  const dockerfile = buildDockerfile();

  const input_schema = parsed.input_schema;
  const input_example =
    parsed.input_example && typeof parsed.input_example === "object"
      ? parsed.input_example
      : input_schema
        ? deriveExampleFromSchema(input_schema)
        : undefined;

  return {
    name: parsed.name || "unnamed_api",
    code: parsed.code,
    dockerfile,
    requirements,
    input_schema,
    input_example,
    cost: 0, // cost tracked by Locus internally
  };
}

/** Build a reasonable example request body from a JSON Schema object. */
function deriveExampleFromSchema(schema: Record<string, unknown>): Record<string, unknown> | undefined {
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return undefined;
  const example: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(props)) {
    if (field && typeof field === "object" && "example" in field) {
      example[key] = (field as { example: unknown }).example;
      continue;
    }
    const type = String(field?.type || "string");
    switch (type) {
      case "number":
      case "integer":
        example[key] = 0;
        break;
      case "boolean":
        example[key] = true;
        break;
      case "array":
        example[key] = [];
        break;
      case "object":
        example[key] = {};
        break;
      default:
        example[key] = typeof field?.description === "string"
          ? `<${field.description}>`
          : `<${key}>`;
    }
  }
  return example;
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
