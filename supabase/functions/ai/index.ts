// Supabase Edge Function: AI proxy for DebateLab
// Keeps provider keys server-side and returns structured JSON.

import { corsHeaders } from "../_shared/cors.ts";

type Provider = "openai" | "anthropic" | "google";

type Feature = "generate" | "attack" | "brainstorm" | "factoids" | "ask";

type Source = {
  title: string;
  content: string;
  origin?: string;
  type: string;
};

const DEFAULT_PROVIDER = (Deno.env.get("AI_DEFAULT_PROVIDER") || "google") as Provider;

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Prompt-injection hardening constants
const MAX_INPUT_LENGTH = 50000;
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|text)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(all\s+)?(previous|prior|above)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /new\s+instruction[s]?\s*:/i,
  /system\s*:\s*\[/i,
  /\[\s*SYSTEM\s*\]/i,
  /\{\s*"role"\s*:\s*"system"/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /###\s*instruction/i,
  /\bDAN\s+mode\b/i,
  /jailbreak/i,
];

/**
 * Sanitizes user input to prevent prompt injection attacks.
 * @returns sanitized string, or null if input is suspicious and should be rejected
 */
function sanitizePromptInput(input: string, fieldName: string): { sanitized: string } | { rejected: string } {
  if (typeof input !== "string") {
    return { sanitized: "" };
  }

  // Strip control characters except newline, carriage return, and tab
  // eslint-disable-next-line no-control-regex
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Check for prompt injection patterns
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      console.warn(`[SECURITY] Prompt injection attempt detected in ${fieldName}: ${sanitized.slice(0, 200)}`);
      return { rejected: `Suspicious content detected in ${fieldName}` };
    }
  }

  // Truncate if too long
  if (sanitized.length > MAX_INPUT_LENGTH) {
    console.warn(`[SECURITY] Input truncated in ${fieldName}: ${sanitized.length} chars -> ${MAX_INPUT_LENGTH}`);
    sanitized = sanitized.slice(0, MAX_INPUT_LENGTH);
  }

  return { sanitized };
}

/**
 * Sanitizes all string fields in an input object.
 * @returns sanitized object, or rejection message if any field is suspicious
 */
function sanitizeInput(input: Record<string, unknown>): { sanitized: Record<string, unknown> } | { rejected: string } {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      const sanitizeResult = sanitizePromptInput(value, key);
      if ("rejected" in sanitizeResult) {
        return sanitizeResult;
      }
      result[key] = sanitizeResult.sanitized;
    } else if (Array.isArray(value)) {
      // Sanitize string arrays (like history)
      const sanitizedArray: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === "object" && item !== null && "content" in item) {
          const contentResult = sanitizePromptInput(String((item as Record<string, unknown>).content || ""), `${key}[${i}].content`);
          if ("rejected" in contentResult) {
            return contentResult;
          }
          sanitizedArray.push({ ...item, content: contentResult.sanitized });
        } else {
          sanitizedArray.push(item);
        }
      }
      result[key] = sanitizedArray;
    } else {
      result[key] = value;
    }
  }

  return { sanitized: result };
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseJsonFromText(text: string, providerName: string) {
  if (!text) {
    throw new Error(`${providerName} returned empty response content`);
  }

  try {
    return JSON.parse(text);
  } catch {
    const codeBlock = text.match(/```json\s*([\s\S]*?)\s*```/i);
    if (codeBlock?.[1]) {
      try {
        return JSON.parse(codeBlock[1]);
      } catch {
        // fall through
      }
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch?.[0]) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // fall through
      }
    }
  }

  throw new Error(`${providerName} returned invalid JSON`);
}

const GENERATE_PROMPT = `You are an expert debate coach. Generate a structured debate case in JSON format.

CRITICAL: The debate format is strictly:
- Introductor (4 min): Introduces the team and presents the arguments.
- R1 (6 min): 4 minutes of stating and reasoning arguments, followed by 2 minutes of refuting the opponent's arguments.
- R2 (6 min): Builds further on R1's arguments but primarily focuses on refuting the opponent.
- Conclusor (3 min): Summarizes the debate and explains why this team wins.

Return a valid JSON object matching this structure:
{
  "caseStructure": {
      "thesis": "string",
      "framework": "string",
      "keyDefinitions": ["string"],
      "burdenOfProof": "string"
  },
  "contentions": [
      {
          "id": "1",
          "claim": "string",
          "reasoning": "string",
          "evidence": "string",
          "needsSource": boolean,
          "sourceQuery": "string (optional)",
          "impact": "string"
      }
  ],
  "predictedOpponentCase": {
      "likelyArguments": ["string"],
      "strategicWeaknesses": ["string"],
      "keyClashes": ["string"]
  },
  "counters": [
      {
          "targetArgument": "string",
          "counterpoint": "string",
          "rebuttal": "string"
      }
  ],
  "metadata": {
      "side": "pro/con",
      "format": "string",
      "generatedAt": "ISO string"
  }
}`;

const ATTACK_PROMPT = `You are an expert debate judge and coach. Analyze the given debate case and provide a critical breakdown in JSON format.

CRITICAL: The debate format is strictly:
- Introductor (4 min): Introduces the team and presents the arguments.
- R1 (6 min): 4 minutes of stating and reasoning arguments, followed by 2 minutes of refuting the opponent's arguments.
- R2 (6 min): Builds further on R1's arguments but primarily focuses on refuting the opponent.
- Conclusor (3 min): Summarizes the debate and explains why this team wins.

Analyze weaknesses, fallacies, and generate cross-ex questions.
Return JSON matching:
{
  "overallAssessment": { "score": number (0-100), "summary": "string", "strengthAreas": ["string"] },
  "weaknesses": [{ "id": "string", "severity": "critical|major|minor", "type": "evidential|logical|structural", "description": "string", "whyWeak": "string", "howOpponentAttacks": "string", "improvedVersion": "string", "affectedQuote": "string" }],
  "fallaciesDetected": [{ "name": "string", "location": "string", "explanation": "string" }],
  "crossExQuestions": [{ "question": "string", "purpose": "string", "expectedTrap": "string" }],
  "weighingAnalysis": { "currentWeighing": "string", "missingComparisons": ["string"], "improvementSuggestions": ["string"] }
}`;

const BRAINSTORM_PROMPT = `You are a creative debate strategist. Brainstorm arguments and angles for the given motion.

CRITICAL: The debate format is strictly:
- Introductor (4 min): Introduces the team and presents the arguments.
- R1 (6 min): 4 minutes of stating and reasoning arguments, followed by 2 minutes of refuting the opponent's arguments.
- R2 (6 min): Builds further on R1's arguments but primarily focuses on refuting the opponent.
- Conclusor (3 min): Summarizes the debate and explains why this team wins.

Output JSON matching:
{
  "needsMoreInfo": boolean,
  "mindmap": [{ "category": "string", "items": [{ "id": "string", "title": "string", "description": "string", "side": "pro|con|neutral", "strength": "strong|moderate|weak", "tradeoffs": ["string"], "relatedTo": ["string"] }] }] (only if mode is mindmap),
  "buckets": [{ "name": "string", "ideas": [...] }] (only if mode is buckets),
  "topFive": [{ "rank": number, "idea": ..., "whyTop": "string" }] (only if mode is topfive),
  "nextSteps": ["string"],
  "warningsAndTradeoffs": ["string"]
}`;

const FACTOIDS_PROMPT = `You are a research assistant. Find relevant facts, statistics, and sources for the given claim.

CRITICAL: The debate format is strictly:
- Introductor (4 min): Introduces the team and presents the arguments.
- R1 (6 min): 4 minutes of stating and reasoning arguments, followed by 2 minutes of refuting the opponent's arguments.
- R2 (6 min): Builds further on R1's arguments but primarily focuses on refuting the opponent.
- Conclusor (3 min): Summarizes the debate and explains why this team wins.

SOURCE INSTRUCTION: Use the provided SEARCH RESULTS to find real, verifiable information.
For each factoid, you MUST include the exact "URL" from the search result in the "citation.url" field.
If no URL is found, leave it blank, but prioritize results with URLs.

Output JSON matching:
{
  "factoids": [{
      "id": "string",
      "shortClaim": "string",
      "keyFigure": "string",
      "context": "string",
      "limitations": "string",
      "citation": { "title": "string", "publisher": "string", "date": "string", "url": "string (the exact URL from search results)", "verified": "verified|unverified" },
      "howToUse": "string",
      "relevanceScore": number
  }],
  "searchSuggestions": ["string"],
  "warnings": ["string"],
  "verificationStatus": "pending"
}`;

const ASK_PROMPT = `You are a debate coach chat bot. Answer the user's question.

CRITICAL: The debate format is strictly:
- Introductor (4 min): Introduces the team and presents the arguments.
- R1 (6 min): 4 minutes of stating and reasoning arguments, followed by 2 minutes of refuting the opponent's arguments.
- R2 (6 min): Builds further on R1's arguments but primarily focuses on refuting the opponent.
- Conclusor (3 min): Summarizes the debate and explains why this team wins.

Output JSON matching:
{
  "response": "string (markdown supported)",
  "followUpQuestions": ["string"],
  "uncertainties": ["string"],
  "prosConsAnalysis": { "pros": ["string"], "cons": ["string"] } (optional),
  "argumentMap": { "mainClaim": "string", "supportingPoints": ["string"], "counterpoints": ["string"], "assumptions": ["string"] } (optional)
}`;

function buildSystemPrompt(feature: Feature, customSystemPrompt?: string | null, sources?: Source[]) {
  const base =
    feature === "generate"
      ? GENERATE_PROMPT
      : feature === "attack"
        ? ATTACK_PROMPT
        : feature === "brainstorm"
          ? BRAINSTORM_PROMPT
          : feature === "factoids"
            ? FACTOIDS_PROMPT
            : ASK_PROMPT;

  const custom = customSystemPrompt ? `\n\nCUSTOM SYSTEM PROMPT:\n${customSystemPrompt}` : "";
  const sourceText = sources && sources.length
    ? `\n\nLOCAL KNOWLEDGE BASE (use as primary factual source):\n${sources.map((s) => `--- ${s.title} (${s.origin || s.type}) ---\n${s.content}\n`).join("\n")}`
    : "";

  return `${base}${custom}${sourceText}`;
}

function buildUserPrompt(feature: Feature, input: Record<string, unknown>, searchContext: string) {
  if (feature === "generate") {
    return `Motion: ${input.motion}\nSide: ${input.side}\nFormat: ${input.format}\nRole: ${input.role}\nLength: ${input.length}\nAudience: ${input.audience}\nTone: ${input.tone}`;
  }
  if (feature === "attack") {
    return `Analyze this case based on the following parameters:\n\nCASE TEXT:\n"${input.caseText}"`;
  }
  if (feature === "brainstorm") {
    return `Motion: ${input.motion}\nSide: ${input.side}\nOutput Mode: ${input.outputMode}\n${input.context ? `Context: ${input.context}` : ''}`;
  }
  if (feature === "factoids") {
    return `Find evidence for claim: "${input.claim}"\n\nSEARCH RESULTS (Use these if relevant):\n${searchContext}\n\nRegion: ${input.region}\nSource Type: ${input.sourceType}\nTimeframe: ${input.timeframe || "Recent (last 5 years)"}\nLanguage: ${input.language}`;
  }
  return `Message: ${input.message}\nMode: ${input.mode}`;
}

async function callOpenAI(messages: Array<{ role: string; content: string }>, model: string, temperature: number) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      response_format: { type: "json_object" },
    }),
  }, 60000);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error: ${text}`);
  }

  const data = await response.json();
  if (!data?.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error("OpenAI returned no choices");
  }
  const content = data.choices[0]?.message?.content;
  return parseJsonFromText(content, "OpenAI");
}

async function callAnthropic(messages: Array<{ role: string; content: string }>, model: string, temperature: number, system: string) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

  const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      system,
      messages,
      max_tokens: 4096,
      temperature,
    }),
  }, 60000);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic error: ${text}`);
  }

  const data = await response.json();
  if (!data?.content || !Array.isArray(data.content) || data.content.length === 0) {
    throw new Error("Anthropic returned no content");
  }
  const content = data.content[0]?.text || "";
  return parseJsonFromText(content, "Anthropic");
}

async function callGoogle(messages: Array<{ role: string; content: string }>, model: string, temperature: number, system: string) {
  const apiKey = Deno.env.get("GOOGLE_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_API_KEY missing");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const contents = messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  const payload = {
    contents,
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    generationConfig: {
      temperature,
      responseMimeType: "application/json",
    },
  };

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, 60000);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google error: ${text}`);
  }

  const data = await response.json();
  if (!data?.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
    throw new Error("Google returned no candidates");
  }
  const text = data.candidates[0]?.content?.parts?.[0]?.text || "";
  return parseJsonFromText(text, "Google");
}

async function jinaSearch(query: string) {
  const apiKey = Deno.env.get("JINA_API_KEY");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetchWithTimeout(`https://s.jina.ai/${encodeURIComponent(query)}`, { headers }, 20000);
  if (!response.ok) return "";
  const data = await response.json();
  if (!data?.data || !Array.isArray(data.data)) return "";
  type JinaResult = { title?: string; url?: string; content?: string; description?: string };
  return data.data
    .map((r: JinaResult) => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content || r.description}\n---`)
    .join("\n");
}

async function jinaRead(url: string) {
  const apiKey = Deno.env.get("JINA_API_KEY");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetchWithTimeout(`https://r.jina.ai/${url}`, { headers }, 20000);
  if (!response.ok) return "";
  const data = await response.json();
  return data.data?.content || data.content || "";
}

function extractUrls(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const feature = body.feature as Feature | undefined;
  const input = body.input as Record<string, unknown> | undefined;
  const provider = (body.provider as Provider | undefined) || DEFAULT_PROVIDER;
  const model = (body.model as string | undefined) || Deno.env.get("AI_DEFAULT_MODEL") || "gemini-3-flash-preview";
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.7;
  const customSystemPrompt = body.customSystemPrompt as string | null | undefined;
  const sources = (body.sources as Source[] | undefined) || [];

  if (!feature) return badRequest("Missing feature");
  if (!input) return badRequest("Missing input");

  // Sanitize all user inputs before processing
  const sanitizeResult = sanitizeInput(input);
  if ("rejected" in sanitizeResult) {
    console.warn(`[SECURITY] Request rejected: ${sanitizeResult.rejected}`);
    return badRequest(sanitizeResult.rejected);
  }
  const sanitizedInput = sanitizeResult.sanitized;

  // Also sanitize custom system prompt if provided
  if (customSystemPrompt) {
    const promptResult = sanitizePromptInput(customSystemPrompt, "customSystemPrompt");
    if ("rejected" in promptResult) {
      console.warn(`[SECURITY] Custom prompt rejected: ${promptResult.rejected}`);
      return badRequest(promptResult.rejected);
    }
  }

  try {
    const systemPrompt = buildSystemPrompt(feature, customSystemPrompt, sources);

    let searchContext = "";
    if (feature === "factoids") {
      searchContext = await jinaSearch(String(sanitizedInput.claim || ""));
    }

    if (feature === "ask") {
      const history = (sanitizedInput.history as Array<{ role: string; content: string }>) || [];
      const message = String(sanitizedInput.message || "");
      const urls = new Set<string>();
      extractUrls(message).forEach((u) => urls.add(u));
      history.slice(-3).forEach((m) => extractUrls(m.content).forEach((u) => urls.add(u)));

      let urlContext = "";
      if (urls.size > 0) {
        const contents = await Promise.all(
          Array.from(urls).slice(0, 3).map(async (u) => {
            const content = await jinaRead(u);
            return `--- Content from ${u} ---\n${content.slice(0, 8000)}\n--- End of ${u} ---`;
          })
        );
        urlContext = "\n\nWEB PAGE CONTEXT:\n" + contents.join("\n");
      }

      const prompt = `Message: ${message}${urlContext}\nMode: ${sanitizedInput.mode}`;
      const messages = [...history, { role: "user", content: prompt }];

      let output: unknown;
      if (provider === "openai") {
        output = await callOpenAI([{ role: "system", content: systemPrompt }, ...messages], model, temperature);
      } else if (provider === "anthropic") {
        output = await callAnthropic(messages, model, temperature, systemPrompt);
      } else if (provider === "google") {
        output = await callGoogle(messages, model, temperature, systemPrompt);
      } else {
        return badRequest(`Unsupported provider: ${provider}`);
      }

      return new Response(JSON.stringify({ output }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
    const messages = [{ role: "user", content: userPrompt }];

    let output: unknown;
    if (provider === "openai") {
      output = await callOpenAI([{ role: "system", content: systemPrompt }, ...messages], model, temperature);
    } else if (provider === "anthropic") {
      output = await callAnthropic(messages, model, temperature, systemPrompt);
    } else if (provider === "google") {
      output = await callGoogle(messages, model, temperature, systemPrompt);
    } else {
      return badRequest(`Unsupported provider: ${provider}`);
    }

    return new Response(JSON.stringify({ output }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
