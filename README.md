# Chef 🍳

## Quickstart

To run examples:

1. Install dependencies

```bash
bun install
```

2. Add OpenAI Key to `.env` file:

```
OPENAI_API_KEY=sk***********Eyg
```

3. Run examples

```bash
bun run ./examples/hitl
```

or

```bash
bun run ./examples/script-generator
```

This project was created using `bun init` in bun v1.3.0. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Overview

Composable context assembly for LLMs and agents

Chef is a tiny, ruthless context assembly engine.

It gives you:
• Declarative ingredients instead of hand-wired pipes
• Deterministic output you can reason about and test
• Token-aware budgeting and graceful compression
• Explainability + provenance (“why did this end up in the prompt?”)
• Zero-boilerplate reuse of context across tools, agents, and turns

Chef’s job: take everything your agent could say, do, or remember — history, system directives, summaries, retrieved docs, tool results, user profile, etc. — and plate only what matters right now in the exact shape you want.

You stop duct-taping context together.
Chef does it for you.

## Why Chef exists

LLM apps all eventually hit the same wall: 1. Context is state.
You need conversation history, tool outputs, knowledge, and policy in every turn — but not all of it, and not always in the same form. 2. Token budgets are real.
You can’t keep throwing “the entire convo so far” and “all retrieved docs” at the model. Latency balloons. Cost spikes. Reasoning quality drops because the model is drowning. 3. Context gets messy fast.
You start with prompt = ....
Then an includeIf(...).
Then “summarize if > 1k tokens”.
Then “prioritize tool results over memory unless…”
Suddenly, shipping changes to context is scarier than shipping model updates.

Chef solves that.

Chef treats context as a set of named dishes (tokens) prepared by recipes, each with:
• Dependencies on other context
• Optional “detail” levels (full vs summary)
• Priority
• Compression strategies
• Explainability metadata

Then you tell Chef what you actually want plated this turn, give it a token budget, and it does the rest.

You get:
• Reusable context components
• Predictable shaping and layering
• Observability of “what went in” and “why”

## Core mental model

### Pantry

Stuff you already have available at runtime.
Example: sessionId, user profile fields, request metadata, live tool results, etc.

You inject these values when you create a Chef instance.

```typescript
const chef = new Chef({
  sessionId: "1234",
  // userProfile: { ... },
  // searchResults: async () => fetchSearchResults("foo"),
});
```

Pantry values can be:
• Raw values
• Or async providers (() => Promise<T>)

Chef will treat pantry entries as first-class “ingredients” that other logic can depend on.

### Recipes

A Recipe is how you convert ingredients into actual prompt text or structured context.
• It’s a class.
• It declares which inputs it needs via @ingredient(...).
• It returns whatever “plate-ready” content you want.

Recipe output can be:
• A string block you want in the prompt,
• A JSON object,
• A list of bullets,
• Anything serializable.

Chef takes care of resolving the dependencies in the right order.

Recipes register into a global cookbook, so you can later ask for them by name.

(You’ll see this in practice below.)

### Tokens

Every Recipe you register (or pantry value you provide) gets a token name like "ConversationHistory" or "SystemDirective".

Your agent’s prompt is just:

“Please give me these tokens in this order, under this budget.”

That’s literally what chef.cook() does.

### Cooking

This is the main step.

```typescript
const plated = await chef.cook({
  order: ["SystemDirective", "ConversationHistory"], // what you want
  budget: 1000, // token budget for all of it
  countTokens, // your tokenizer
  explain: true, // ask for provenance / accounting
});
```

Chef will: 1. Gather and render each requested token (“prepare the dishes”) 2. Measure token cost for each 3. If there’s a budget, it will:
• Always include the first item, even if it’s huge (critical guardrail)
• Sort other items by priority and try to fit them
• Auto-fallback to “compressed” versions if available
• Drop low-priority items if still over budget 4. Return:
• The final prompt context (plated.context)
• A full breakdown of what was included/excluded and why (plated.plates)
• Token totals

## What makes Chef different

### 1. Declarative dependencies between context blocks

Recipes say what they need using @ingredient("TokenName").
You don’t write glue code every turn. You don’t manually thread state around.

Chef automatically:
• resolves dependencies
• caches
• injects subfields (via JSONPath)
• throws loudly when a contract breaks

You get strong, testable contracts between “context producers.”

### 2. Token-aware budgeting and graceful fallback

You tell Chef your target budget.
Chef will:
• Rank items by priority
• Keep high-priority context
• Prefer compressed summaries where possible
• Drop low-importance stuff if you’re still over

This is per-request, not a one-time prompt hack.
You can tune this per tool, per agent, per turn.

### 3. Explainability

When you run with { explain: true }, you get introspection for free.

Every plated item comes with:
• decision: included / compressed / dropped
• reason
• priorityScore
• cost in tokens
• running totals
• full lineage (“this summary was generated from ConversationHistory via @ingredient(…)”)

This is huge for:
• debugging
• audits / safety reviews
• cost analysis
• telling the next engineer “don’t worry, here’s exactly what went into the model”

### 4. Detail levels + compression hooks

A Recipe can publish multiple “detail profiles” like:
• "full" → full transcript
• "summary" → distilled bullets
• "bullets" → outline only

Callers choose intent:

order: [
{ token: "ConversationHistory", detail: "summary" },
"SystemDirective",
]

Chef will try to respect those detail levels, then optionally compress further if the budget still hurts.

This gives you graceful “zoom out / zoom in” behavior without rewriting your prompt builder every week.

### 5. No tokenizer lock-in

Chef does not assume a specific model tokenizer.

You hand it countTokens(text) — for example, a function that wraps js-tiktoken (shown in the examples below).
That means you can target gpt-4o today, local Llama tomorrow, Gemini next week, etc., without rewriting the budgeting logic.

## Example: Human-in-the-loop (HITL) agent

Let’s look at the included HITL example.
This is a minimal “chat with memory” loop that: 1. Appends user/assistant messages to a conversation log. 2. Uses Chef to build a safe, structured prompt with:
• A system directive (behavioral policy)
• Recent conversation history 3. Invokes an LLM with that plated context. 4. Saves the AI response back to the conversation log.

1. Token counting

```typescript
// examples/utils/tokens.ts
import {
  getEncoding,
  getEncodingNameForModel,
  type TiktokenModel,
} from "js-tiktoken";

import { MODEL_ID } from "@examples/utils/constants";

export const encoding = getEncoding(
  getEncodingNameForModel(MODEL_ID as TiktokenModel)
);

// model-aware token counter
export const countTokens = (text: string): number => {
  return encoding.encode(text).length;
};
```

This is the tokenizer we’ll pass to chef.cook() so Chef can make budget decisions based on the actual model you’re using.

2. Create your Chef instance with pantry data

```typescript
import Chef from "@lib/core/context/Chef";
import type { HITLInputType } from "@examples/hitl/specs/hitlInput";

const chef = new Chef<HITLInputType>({
  sessionId, // pantry value: can be sync value or async provider
});
```

Here the pantry only includes sessionId.
Recipes can @ingredient(“sessionId”) to find the right conversation log for that user/session.

3. Cook the context

```typescript
const plated = await chef.cook({
  order: ["SystemDirective", "ConversationHistory"],
  budget: 1000,
  explain: true,
  countTokens,
});
```

• order defines what we want “on the plate,” and in what order.
• First item is SystemDirective (i.e. “you are an assistant that must…”)
• Second is ConversationHistory
• budget: 1000 means:
• Try to keep it under ~1000 tokens total
• Always include the first item (the directive), even if it’s huge
• Prefer to compress/truncate/summarize history if needed
• explain: true gives us full provenance.

4. Inspect what Chef gave us

```typescript
console.log("[plated.context]:\n", plated.context);
console.log("[plated.plates]:\n", plated.plates);
console.log("[plated.totalTokens]:\n", plated.totalTokens);
```

plated.context is now your final prompt to send to the model.

plated.plates is an array of objects like:

```typescript
[
  {
    token: "SystemDirective",
    decision: "forced-include", // or "included", "dropped"
    reason: "first item is always included (compressed to save budget)",
    servedDetail: "full",
    priorityTag: "critical",
    priorityScore: 100,
    wasCompressed: false,
    compressionNote: undefined,
    originalCost: 180,
    compressedCost: 60,
    cost: 180,
    runningTotalBefore: 0,
    runningTotalAfter: 180,
    lineage: [
      {
      token: "SystemDirective",
      providerName: "SystemDirectiveRecipe",
      deps: [...],
      },
      // ...
    ],
  },
  // ...
]
```

This gives you absolute clarity into what went into the LLM call, how big it was, and what got left out (and why).

5. Call the model with structured output

```typescript
import { HITLOutputSchema } from "@examples/hitl/specs/hitlOutput";
import { llm } from "@examples/utils/llms";

const { response } = await llm
  .withStructuredOutput(HITLOutputSchema)
  .invoke(plated.context);

console.log("AI Response:", response);
```

You’re now using Chef context as input, and validating the model’s output shape.

6. Store the AI response back into history

```typescript
import { addMessage } from "@examples/hitl/conversationHistory";

// save AI response to conversation log
await addMessage(sessionId, "assistant", response);
```

The next turn, ConversationHistory will include this assistant message.
Chef will automatically pick it up (and summarize/compress if the session gets long).

## `chef.cook()` signature

```typescript
await chef.cook({
  order: [
    "SystemDirective",
    { token: "ConversationHistory", detail: "summary" },
    // you can keep adding tokens here...
  ],
  budget: 1500, // optional, number of tokens you can afford
  countTokens: (text: string) => number, // required for budgeting
  rankPriority: (info) => number, // optional override
  explain: true, // optional; default false
});
```

Key knobs:
• order
Array of tokens (strings), or { token, detail } objects.
This is you saying: “Plate these, in this order, for this turn.”
• budget
Chef will try to keep the final assembled prompt under this token limit.
• First item in order is always included
• Remaining items are included by priority
• Auto-compression is attempted if available
• If something still doesn’t fit, it’s dropped
• countTokens
You control how tokens are counted. Chef doesn’t assume the model.
• rankPriority
Custom priority sorter:

```typescript
rankPriority?: (info: {
  token: string;
  recipeName: string;
  priorityTag?: string | number;
  index: number;
}) => number;
```

By default, Chef maps common tags like "critical", "high", "low", or uses numeric priority fields declared on recipes. Higher score = more important.

    •	explain

true returns:

```typescript
{
  context: string; // final prompt to send to model
  totalTokens: number; // final "cost"
  budget?: number; // the budget you gave us
  plates: PlateInfo[]; // full provenance/debug info
}
```

If explain is false or omitted, cook() just returns the context string directly.

## Debuggability & safety

Chef gives you something prompt hacks never will: auditability.

You can:
• Log every call to chef.cook({ explain: true })
• Persist plated.plates for postmortems
• Prove what the model did or did not “see”
• Enforce internal policy like “SystemDirective must always be first and must always plate in full”

You can even diff runs over time:
• “Why did the model ignore user instructions on Oct 27, 2025?”
• “Did we silently stop including the safety block because of budget pressure?”
• “Is history being summarized too aggressively for high-value users?”

Chef hands you this evidence.

## When to reach for Chef

Use Chef any time you find yourself doing manual prompt stitching like:
• “Take last 10 messages, unless too long, then summarize.”
• “Always prepend policy block.”
• “Only include tool output if we actually called the tool this turn.”
• “Make sure we include the customer’s current plan tier and SLA.”
• “Drop sentiment analysis unless the user is escalating.”
• “Rewrite this agent into a general-purpose assistant without leaking internal tools.”

Chef is the layer that turns all of that from ‘ad-hoc if/else spaghetti’ into reusable, explainable, testable modules.

## TL;DR pitch

Chef = Context Engineering as a first-class runtime.
• You describe what context is, not how to jam it together.
• You get consistent, explainable prompts across tools/turns/agents.
• You get adaptive token budgeting without rewriting your prompt every sprint.
• You get observability of what the model actually saw.

Chef makes context assembly:
• modular
• inspectable
• budget-aware
• production-friendly

This is how you stop duct-taping prompts and start shipping context like an adult. 🍽️
