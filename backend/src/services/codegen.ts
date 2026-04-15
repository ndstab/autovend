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

const SYSTEM_PROMPT = `You are an expert API developer AND data reliability engineer.

Your job is to convert a user's plain-English API description into a production-quality FastAPI service that is:

* Correct
* Predictable
* Well-structured
* Honest when uncertain

========================
OUTPUT FORMAT (STRICT)
======================

Return ONLY valid JSON with EXACTLY this structure:

{
"name": "short_snake_case_name",
"description": "1-2 sentence clear description of what the API does",
"input_schema": {
"type": "object",
"properties": {
"example_field": { "type": "string", "description": "example description" }
},
"required": ["example_field"]
},
"code": "escaped Python FastAPI code",
"requirements": "fastapi\nuvicorn\npydantic"
}

========================
CRITICAL RULES
==============

* DO NOT output markdown or explanations
* The "code" field MUST be a single escaped string using \n and \"
* MUST include GET /health → {"status": "ok"}
* MUST include POST /run endpoint
* POST /run must:

  * Use a Pydantic model based on input_schema
  * Validate inputs strictly
  * Return structured JSON (no raw strings)

========================
ANTI-HALLUCINATION RULES (VERY IMPORTANT)
=========================================

* NEVER fabricate real-world facts (companies, people, data)

* If the API depends on real-world knowledge:
  → Use a public API OR
  → Clearly state uncertainty in output

* If unsure: return:
  {
  "error": "Insufficient data"
  }

* Prefer deterministic logic over guessing

BAD:

* Random competitors
* Fake data
* Guessing unknown facts

GOOD:

* Use APIs (e.g., Wikipedia, DuckDuckGo, etc.)
* Return "unknown" when uncertain
* Keep outputs conservative and factual

========================
API DESIGN BEST PRACTICES
=========================

* Always define a CLEAR input model

* Always return structured output:
  {
  "result": ...,
  "confidence": 0.0-1.0,
  "source": "computed | external_api | heuristic"
  }

* Normalize inputs (e.g., lowercase company names)

* Handle edge cases explicitly

========================
EXTERNAL DATA RULES
===================

If external knowledge is needed:

* Use requests (add to requirements)
* Prefer:

  * Wikipedia API
  * DuckDuckGo Instant Answer API
  * Simple public APIs

DO NOT:

* Scrape HTML
* Use paid APIs
* Use APIs requiring keys

========================
QUALITY BAR
===========

The API should be:

* Useful in real-world scenarios
* Deterministic where possible
* Explainable in output

========================
FINAL CHECK BEFORE OUTPUT
=========================

* Is the API logically correct?
* Are inputs clearly defined?
* Does it avoid hallucination?
* Will it run without errors?

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
