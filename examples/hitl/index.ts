import "dotenv/config";
import { addMessage } from "@examples/hitl/conversationHistory";

import Chef from "@lib/core/context/Chef";
import "@examples/hitl/recipes";

import type { HITLInputType } from "@examples/hitl/specs/hitlInput";
import { countTokens } from "@examples/utils/tokens";
import { HITLOutputSchema } from "@examples/hitl/specs/hitlOutput";
import { llm } from "@examples/utils/llms";

const main = async () => {
  const userMessage =
    process.argv[2] || "Hello, can you help me with my project?";
  const sessionId = process.argv[3] || "1234";

  // save user message to conversation log
  await addMessage(sessionId, "user", userMessage);

  const chef = new Chef<HITLInputType>({
    sessionId,
  });

  const plated = await chef.cook({
    order: ["SystemDirective", "ConversationHistory"],
    budget: 1000,
    explain: true,
    countTokens,
  });

  console.log("[plated.context]:\n", plated.context);
  console.log("[plated.plates]:\n", plated.plates);
  console.log("[plated.totalTokens]:\n", plated.totalTokens);

  const { response } = await llm
    .withStructuredOutput(HITLOutputSchema)
    .invoke(plated.context);

  console.log("AI Response:", response);

  // save AI response to conversation log
  await addMessage(sessionId, "assistant", response);
};

main();
