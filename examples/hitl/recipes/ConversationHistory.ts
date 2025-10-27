import { loadSessionLog } from "@examples/hitl/conversationHistory";
import { cookbook, ingredient } from "@lib/core/context/Cookbook";
import Recipe from "@lib/core/context/Recipe";

@cookbook
export class ConversationHistory extends Recipe<string> {
  description = "The conversation history for HITL interactions.";

  static priority = 20;
  static summaryRecipe = "ConversationHistorySummary";
  static compressible = true;

  async prepare(@ingredient("sessionId") sessionId: string): Promise<string> {
    return loadSessionLog(sessionId);
  }
}
