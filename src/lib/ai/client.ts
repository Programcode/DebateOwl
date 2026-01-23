import { mockGenerateCase, mockAttackCase, mockBrainstorm, mockFactoids, mockAsk } from './providers/mock-provider';
import type { ProviderConfig } from './providers/types';
import type { GenerateInput, GenerateOutput } from './schemas/generate';
import type { AttackOutput } from './schemas/attack';
import type { BrainstormOutput } from './schemas/brainstorm';
import type { FactoidsOutput } from './schemas/factoids';
import type { AskOutput } from './schemas/ask';

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

  // Use correct API version and simplified URL structure
  // v1beta is correct for most models, but let's be safer with error logging
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

import { useSettingsStore } from '../stores/settings-store';

// --- Unified Dispatcher ---

async function dispatchAI(
  config: ProviderConfig, 
  messages: any[], 
  systemPrompt: string,
  jsonMode: boolean = true
): Promise<any> {
  const store = useSettingsStore.getState();
  const finalSystemPrompt = store.customSystemPrompt 
    ? `${store.customSystemPrompt}\n\nIMPORTANT: The following technical instructions must be followed strictly for the app to work:\n${systemPrompt}`
    : systemPrompt;

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

export async function attackCase(caseText: string, config: ProviderConfig): Promise<AttackOutput> {
  if (config.provider === 'mock') return mockAttackCase(caseText);

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

  return dispatchAI(config, [{ role: 'user', content: `Analyze this case:\n\n${caseText}` }], systemPrompt);
}

export async function brainstorm(motion: string, outputMode: string, config: ProviderConfig): Promise<BrainstormOutput> {
  if (config.provider === 'mock') return mockBrainstorm(motion, outputMode);

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

  return dispatchAI(config, [{ role: 'user', content: `Motion: ${motion}\nOutput Mode: ${outputMode}` }], systemPrompt);
}

export async function factoids(claim: string, config: ProviderConfig): Promise<FactoidsOutput> {
  if (config.provider === 'mock') return mockFactoids(claim);

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
        "citation": { "title": "string", "publisher": "string", "date": "string", "verified": "unverified" },
        "howToUse": "string",
        "relevanceScore": number
    }],
    "searchSuggestions": ["string"],
    "warnings": ["string"],
    "verificationStatus": "pending"
  }`;

  return dispatchAI(config, [{ role: 'user', content: `Find evidence for: ${claim}` }], systemPrompt);
}

export async function askChat(message: string, history: { role: 'user' | 'assistant', content: string }[], mode: string, config: ProviderConfig): Promise<AskOutput> {
  if (config.provider === 'mock') return mockAsk(message, mode);

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

  // Convert history to provider format
  // We filter out any complex output objects from history and just keep text content for context
  const pastMessages = history.map(m => ({
    role: m.role,
    content: m.content
  }));

  const currentMessage = { role: 'user', content: `Message: ${message}\nMode: ${mode}` };

  return dispatchAI(config, [...pastMessages, currentMessage], systemPrompt);
}