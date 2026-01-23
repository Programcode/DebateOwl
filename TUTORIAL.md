# Tutorial: Adding Custom AI Providers & API Keys

This tutorial will guide you through adding a real AI provider (OpenAI) to your Lovable project, allowing you to use your own API keys.

## Overview

1.  **Update Interfaces:** Ensure our provider definitions support API keys.
2.  **Update Settings UI:** Allow users to enter their API key in the Settings page.
3.  **Create the Provider:** Implement the actual API calls to OpenAI.
4.  **Connect the Logic:** hook up the new provider to the application.

---

## Step 1: Update Provider Definitions

First, let's explicitly mark which providers require an API key.

**File:** `src/lib/ai/providers/types.ts`

Update the `AIProvider` interface and the `DEFAULT_PROVIDERS` list:

```typescript
// src/lib/ai/providers/types.ts

export interface AIProvider {
  id: string;
  name: string;
  models: AIModel[];
  isAvailable: () => boolean;
  requiresKey?: boolean; // <--- Add this
}

// ... existing code ...

export const DEFAULT_PROVIDERS: AIProvider[] = [
  // ... mock and lovable providers ...
  {
    id: 'openai',
    name: 'OpenAI Compatible',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Latest OpenAI model', maxTokens: 8000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable', maxTokens: 4000 },
    ],
    isAvailable: () => true, // <--- Change to true
    requiresKey: true,       // <--- Add this
  },
];
```

## Step 2: Add API Key Input to Settings

Now, let's add an input field to `SettingsPage.tsx` that appears when a provider requiring a key is selected.

**File:** `src/pages/SettingsPage.tsx`

Import the `Input` component at the top:
```typescript
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react'; // Optional: for show/hide password
import { useState } from 'react';
```

Inside the `SettingsPage` component, inside the `features.map` loop, add this logic after the model selection:

```tsx
// Inside features.map(...)
const selectedProvider = DEFAULT_PROVIDERS.find(p => p.id === config.provider);

// ... existing Provider and Model selects ...

{/* API Key Input (Only if required) */}
{selectedProvider?.requiresKey && (
  <div className="space-y-2 col-span-full sm:col-span-1">
    <Label className="flex items-center gap-2">
      API Key
    </Label>
    <Input
      type="password"
      value={config.apiKey || ''}
      onChange={(e) => setFeatureConfig(feature, { apiKey: e.target.value })}
      placeholder="sk-..."
      className="font-mono text-sm"
    />
  </div>
)}
```

## Step 3: Create the OpenAI Provider

Create a new file to handle the actual API calls.

**File:** `src/lib/ai/providers/openai-provider.ts`

```typescript
import type { GenerateInput, GenerateOutput } from '../schemas/generate';
import type { ProviderConfig } from './types';

// Helper to make the actual request
async function callOpenAI(
  messages: any[], 
  config: ProviderConfig, 
  jsonMode: boolean = true
) {
  if (!config.apiKey) {
    throw new Error('API Key is missing');
  }

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
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API request failed');
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

// Feature Implementation: Generate Case
export async function openaiGenerateCase(
  input: GenerateInput, 
  config: ProviderConfig
): Promise<GenerateOutput> {
  const systemPrompt = `You are an expert debate coach. Generate a structured debate case in JSON format.
  The user will provide the motion, side, and format.
  Return a valid JSON object matching this structure:
  {
    "caseStructure": { "thesis": "...", "framework": "...", ... },
    "contentions": [ { "claim": "...", "reasoning": "...", ... } ],
    ...
  }`;

  const userPrompt = `Motion: ${input.motion}
  Side: ${input.side}
  Format: ${input.format}
  Role: ${input.role}
  
  Generate a full case.`;

  return callOpenAI(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    config
  );
}

// Add other feature functions (attack, brainstorm, etc.) similarly...
```

## Step 4: Centralize AI Logic

Instead of hardcoding "mock" checks in every page, let's create a central client.

**File:** `src/lib/ai/client.ts`

```typescript
import { mockGenerateCase } from './providers/mock-provider';
import { openaiGenerateCase } from './providers/openai-provider';
import type { ProviderConfig } from './providers/types';
import type { GenerateInput, GenerateOutput } from './schemas/generate';

export async function generateCase(
  input: GenerateInput, 
  config: ProviderConfig
): Promise<GenerateOutput> {
  if (config.provider === 'mock') {
    return mockGenerateCase(input.motion, input.side);
  }
  
  if (config.provider === 'openai') {
    return openaiGenerateCase(input, config);
  }

  throw new Error(`Provider ${config.provider} not implemented`);
}
```

## Step 5: Update the Page

Finally, update `GeneratePage.tsx` to use this new client.

**File:** `src/pages/GeneratePage.tsx`

```typescript
import { generateCase } from '@/lib/ai/client'; // Import the new client

// ... inside the component ...

const handleSubmit = async (data: GenerateInput) => {
  setGenerateLoading(true);
  try {
    // ONE LINE to handle all providers!
    const result = await generateCase(data, config);
    setGenerateResult(result);
  } catch (error) {
    console.error('Failed to generate case:', error);
    // Ideally show a toast notification here
  } finally {
    setGenerateLoading(false);
  }
};
```

## Next Steps

*   Repeat **Step 3** (Provider Implementation) for `attack`, `brainstorm`, `factoids`, and `ask`.
*   Repeat **Step 4** (Client Centralization) to add functions for those features.
*   Update the corresponding pages to use the new client functions.
