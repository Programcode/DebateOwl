import { mockGenerateCase, mockAttackCase, mockBrainstorm, mockFactoids, mockAsk } from './providers/mock-provider';
import type { ProviderConfig } from './providers/types';
import type { GenerateInput, GenerateOutput } from './schemas/generate';
import type { AttackOutput, AttackInput } from './schemas/attack';
import type { BrainstormOutput, BrainstormInput } from './schemas/brainstorm';
import type { FactoidsOutput, FactoidsInput } from './schemas/factoids';
import type { AskOutput } from './schemas/ask';
import { useSettingsStore } from '../stores/settings-store';
import { useSessionStore } from '../stores/session-store';

// --- Shared Helpers ---

async function callOpenAI(messages: any[], config: ProviderConfig, jsonMode: boolean = true) {
  if (!config.apiKey) throw new Error('API Key is missing for OpenAI');
  
  console.log('[OpenAI Request]', { model: config.model, messages });

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages,
        temperature: config.temperature,
        response_format: jsonMode ? { type: "json_object" } : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OpenAI Error Response]', errorText);
      let errorMessage = `OpenAI Error: ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) errorMessage = errorJson.error.message;
      } catch (e) {}
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('[OpenAI Response]', data);
    const content = data.choices[0].message.content;
    return jsonMode ? JSON.parse(content) : content;
  } catch (error) {
    console.error('[OpenAI Failure]', error);
    throw error;
  }
}

async function callAnthropic(messages: any[], config: ProviderConfig, systemPrompt?: string) {
  if (!config.apiKey) throw new Error('API Key is missing for Anthropic');

  console.log('[Anthropic Request]', { model: config.model, system: systemPrompt, messages });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerously-allow-browser': 'true'
      },
      body: JSON.stringify({
        model: config.model,
        system: systemPrompt,
        messages: messages,
        max_tokens: 4096,
        temperature: config.temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Anthropic Error Response]', errorText);
      let errorMessage = `Anthropic Error: ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) errorMessage = errorJson.error.message;
      } catch (e) {}
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('[Anthropic Response]', data);
    const content = data.content[0].text;
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return JSON.parse(content);
    } catch (e) {
      console.warn("Failed to parse Anthropic JSON. Raw content:", content);
      throw new Error("Failed to parse AI response as JSON. Check console for raw output.");
    }
  } catch (error) {
    console.error('[Anthropic Failure]', error);
    throw error;
  }
}

async function callGoogle(messages: any[], config: ProviderConfig, systemPrompt?: string) {
  if (!config.apiKey) throw new Error('API Key is missing for Google Gemini');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
  
  const contents = messages.map((m: any) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));

  const payload = {
    contents: contents,
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    generationConfig: {
      temperature: config.temperature,
      responseMimeType: "application/json",
    }
  };

  console.log('[Google Request]', { url, payload });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Google Error Response]', errorText);
      let errorMessage = `Google Error: ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) errorMessage = errorJson.error.message;
      } catch (e) {}
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('[Google Response]', data);
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("Google returned no candidates. This might be a safety filter.");
    }

    const text = data.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  } catch (error) {
    console.error('[Google Failure]', error);
    throw error;
  }
}

// --- Jina AI Helpers ---

async function getJinaKey() {
  const store = useSettingsStore.getState();
  let key = store.apiKeys['jina'];
  if (!key && store.isAdmin && typeof window !== 'undefined' && window.env?.VITE_JINA_API_KEY) {
    key = window.env.VITE_JINA_API_KEY;
  }
  return key;
}

async function callJinaReader(url: string): Promise<string> {
  const apiKey = await getJinaKey();
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  try {
    const response = await fetch(`https://r.jina.ai/${url}`, { headers });
    if (!response.ok) throw new Error(`Jina Reader failed: ${response.statusText}`);
    const data = await response.json();
    return data.data?.content || data.content || "No content extracted";
  } catch (e) {
    console.error("Jina Reader Error:", e);
    return `[Failed to read URL ${url}: ${e instanceof Error ? e.message : 'Unknown error'}]`;
  }
}

async function callJinaSearch(query: string): Promise<string> {
  const apiKey = await getJinaKey();
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  try {
    const response = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, { headers });
    if (!response.ok) throw new Error(`Jina Search failed: ${response.statusText}`);
    const data = await response.json();
    
    if (data.data && Array.isArray(data.data)) {
      return data.data.map((result: any) => 
        `Title: ${result.title}\nURL: ${result.url}\nContent: ${result.content || result.description}\n---\n`
      ).join('\n');
    }
    return "No search results found.";
  } catch (e) {
    console.error("Jina Search Error:", e);
    return `[Search failed: ${e instanceof Error ? e.message : 'Unknown error'}]`;
  }
}

// --- Unified Dispatcher ---

async function dispatchAI(
  config: ProviderConfig, 
  messages: any[], 
  systemPrompt: string,
  jsonMode: boolean = true,
  options?: { allowMarkdown?: boolean }
): Promise<any> {
  const settings = useSettingsStore.getState();
  const session = useSessionStore.getState();
  const allowMarkdown = options?.allowMarkdown ?? false;
  
  // 1. Fetch Local Knowledge (Active Sources)
  const activeSources = session.sourceLibrary.filter(s => s.isActive);
  const localKnowledge = activeSources.length > 0 
    ? `\n\nLOCAL KNOWLEDGE BASE (Use this information as your primary factual source):\n${activeSources.map(s => `--- SOURCE: ${s.title} (${s.origin}) ---\n${s.content}\n`).join('\n')}\n`
    : "";

  // 2. Combine prompts
  let finalSystemPrompt = systemPrompt;
  
  if (settings.customSystemPrompt) {
    finalSystemPrompt = `${settings.customSystemPrompt}\n\nIMPORTANT: The following technical instructions must be followed strictly for the app to work:\n${finalSystemPrompt}`;
  }

  // Prepend local knowledge
  finalSystemPrompt = localKnowledge + finalSystemPrompt;

  // Add NO MARKDOWN instruction unless the endpoint allows markdown
  if (!allowMarkdown) {
    finalSystemPrompt += `\n\nCRITICAL FORMATTING INSTRUCTION: Do NOT use any Markdown formatting (like **bold**, *italics*, # headers, etc.) in your JSON string values. Use plain text only. The frontend handles styling.`;
  }

  console.log('[DispatchAI] Starting request...', { provider: config.provider, model: config.model });
  
  try {
    if (config.provider === 'openai') {
      const allMessages = [{ role: 'system', content: finalSystemPrompt }, ...messages];
      return await callOpenAI(allMessages, config, jsonMode);
    }
    
    if (config.provider === 'anthropic') {
      return await callAnthropic(messages, config, finalSystemPrompt);
    }

    if (config.provider === 'google') {
      return await callGoogle(messages, config, finalSystemPrompt);
    }

    if (config.provider === 'lovable') {
        throw new Error("Lovable Cloud integration requires backend implementation. Please use OpenAI/Anthropic/Google with API keys or Mock mode.");
    }

    throw new Error(`Provider ${config.provider} not supported`);
  } catch (error) {
    console.error('[DispatchAI] Error caught:', error);
    throw error; // Re-throw to be caught by the UI components
  }
}


// --- Feature Implementations ---

export async function generateCase(input: GenerateInput, config: ProviderConfig): Promise<GenerateOutput> {
  if (config.provider === 'mock') return mockGenerateCase(input.motion, input.side);

  const systemPrompt = `You are an expert debate coach. Generate a structured debate case in JSON format.
  
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

  const userPrompt = `Motion: ${input.motion}
  Side: ${input.side}
  Format: ${input.format}
  Role: ${input.role}
  Length: ${input.length}
  Audience: ${input.audience}
  Tone: ${input.tone}
  
  Generate a full case for the ${input.side} side.`;

  return dispatchAI(config, [{ role: 'user', content: userPrompt }], systemPrompt);
}

export async function attackCase(input: AttackInput, config: ProviderConfig): Promise<AttackOutput> {
  if (config.provider === 'mock') return mockAttackCase(input.caseText);

  const systemPrompt = `You are an expert debate judge and coach. Analyze the given debate case and provide a critical breakdown in JSON format.
  
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

  let userPrompt = `Analyze this case based on the following parameters:
  
  - Aggressiveness: ${input.aggressiveness.toUpperCase()}
    ${input.aggressiveness === 'ruthless' ? '(Be extremely critical, find every minor flaw, show no mercy)' : input.aggressiveness === 'mild' ? '(Be constructive and encouraging, focus on major fixes)' : '(Provide balanced, objective criticism)'}
  
  - Judge Paradigm: ${input.judgeParadigm.toUpperCase()}
    ${input.judgeParadigm === 'logic' ? '(Focus strictly on logical consistency and validity of premises)' : input.judgeParadigm === 'values' ? '(Focus on moral framework, impact on human dignity/rights)' : '(Focus on real-world policy impacts, solvency, and net benefits)'}
  
  - Fallacy Detection: ${input.detectFallacies ? 'ENABLED (List all logical fallacies found)' : 'DISABLED (Skip minor fallacies, focus on structural issues)'}
  
  - Weighing Analysis: ${input.analyzeWeighing ? 'ENABLED (Critique their impact calculus)' : 'DISABLED'}

  CASE TEXT:
  "${input.caseText}"`;

  return dispatchAI(config, [{ role: 'user', content: userPrompt }], systemPrompt);
}

export async function brainstorm(input: BrainstormInput, config: ProviderConfig): Promise<BrainstormOutput> {
  if (config.provider === 'mock') return mockBrainstorm(input.motion, input.outputMode);

  const systemPrompt = `You are a creative debate strategist. Brainstorm arguments and angles for the given motion.
  
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

  const userPrompt = `Motion: ${input.motion}
  
  Parameters:
  - Side to Explore: ${input.side.toUpperCase()}
  - Output Mode: ${input.outputMode}
  ${input.context ? `\nContext/Existing Ideas:\n"${input.context}"` : ''}`;

  return dispatchAI(config, [{ role: 'user', content: userPrompt }], systemPrompt);
}

export async function factoids(input: FactoidsInput, config: ProviderConfig): Promise<FactoidsOutput> {
  if (config.provider === 'mock') return mockFactoids(input.claim);

  // Perform Jina Search
  let searchContext = "";
  try {
    searchContext = await callJinaSearch(input.claim);
  } catch (e) {
    console.error("Jina Search failed silently, proceeding without search results", e);
  }

  const systemPrompt = `You are a research assistant. Find relevant facts, statistics, and sources for the given claim.
  
  CRITICAL: The debate format is strictly:
  - Introductor (4 min): Introduces the team and presents the arguments.
  - R1 (6 min): 4 minutes of stating and reasoning arguments, followed by 2 minutes of refuting the opponent's arguments.
  - R2 (6 min): Builds further on R1's arguments but primarily focuses on refuting the opponent.
  - Conclusor (3 min): Summarizes the debate and explains why this team wins.

  Output JSON matching:
  {
    "factoids": [{
        "id": "string", 
        "shortClaim": "string", 
        "keyFigure": "string", 
        "context": "string", 
        "limitations": "string", 
        "citation": { "title": "string", "publisher": "string", "date": "string", "verified": "verified|unverified" },
        "howToUse": "string",
        "relevanceScore": number
    }],
    "searchSuggestions": ["string"],
    "warnings": ["string"],
    "verificationStatus": "pending"
  }`;

  const userPrompt = `Find evidence for claim: "${input.claim}"
  
  SEARCH RESULTS (Use these if relevant):
  ${searchContext}
  
  Parameters:
  - Region: ${input.region}
  - Source Type: ${input.sourceType}
  - Timeframe: ${input.timeframe || 'Recent (last 5 years)'}
  - Language: ${input.language}`;

  return dispatchAI(config, [{ role: 'user', content: userPrompt }], systemPrompt);
}

async function summarizeHistory(messages: { role: string, content: string }[], config: ProviderConfig): Promise<string> {
  const prompt = `Summarize the following debate conversation history into a concise paragraph. Capture key arguments, agreed points, and the current topic. Preserve the context for a debate coach.
  
  HISTORY:
  ${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}`;

  // Use a fast model for summarization if possible, or just current config
  // We force jsonMode=false because we just want text
  try {
    return await dispatchAI(config, [{ role: 'user', content: prompt }], "You are a helpful summarizer.", false);
  } catch (e) {
    console.error("Summarization failed:", e);
    return "Previous conversation (summarization failed).";
  }
}

export async function askChat(message: string, history: { role: 'user' | 'assistant', content: string }[], mode: string, config: ProviderConfig): Promise<AskOutput> {
  if (config.provider === 'mock') return mockAsk(message, mode);

  // 1. Detect URLs (Current message + History)
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let urls = message.match(urlRegex) || [];
  
  // If no URLs in current message, check recent history (last 3 messages)
  if (urls.length === 0 && history.length > 0) {
    const recentHistory = history.slice(-3);
    recentHistory.forEach(msg => {
      const found = msg.content.match(urlRegex);
      if (found) urls = [...urls, ...found];
    });
  }

  // Deduplicate URLs
  const uniqueUrls = [...new Set(urls)];
  let urlContext = "";

  if (uniqueUrls.length > 0) {
    const contents = await Promise.all(uniqueUrls.slice(0, 3).map(async url => {
      const content = await callJinaReader(url);
      return `--- Content from ${url} ---\n${content.slice(0, 10000)}...\n--- End of ${url} ---`;
    }));
    urlContext = "\n\nWEB PAGE CONTEXT:\n" + contents.join('\n');
  }

  const systemPrompt = `You are a debate coach chat bot. Answer the user's question.
  
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

  // 2. Handle History (Summarization vs Window)
  let contextMessages: { role: string, content: string }[] = [];
  
  // Clean history first
  const cleanHistory = history.map(m => ({ role: m.role, content: m.content }));

  if (cleanHistory.length > 25) {
    // Summarize older messages (keep last 20 verbatim)
    const messagesToSummarize = cleanHistory.slice(0, cleanHistory.length - 20);
    const recentMessages = cleanHistory.slice(-20);
    
    // We run summarization in parallel if we can, but here we need it before sending
    const summary = await summarizeHistory(messagesToSummarize, config);
    
    contextMessages = [
      { role: 'system', content: `Previous conversation summary: ${summary}` },
      ...recentMessages
    ];
  } else {
    contextMessages = cleanHistory;
  }

  const currentMessage = { role: 'user', content: `Message: ${message}${urlContext}\nMode: ${mode}` };

  return dispatchAI(config, [...contextMessages, currentMessage], systemPrompt, true, { allowMarkdown: true });
}
