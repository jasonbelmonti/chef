import { cookbook, ingredient } from "@lib/core/context/Cookbook";
import Recipe from "@lib/core/context/Recipe";
import type { ConversationHistoryType } from "@examples/hitl/specs/conversationHistory";

@cookbook
export class ConversationHistorySummary extends Recipe<ConversationHistoryType> {
  description = "A summary of the conversation history for HITL interactions.";

  static priority = 20;
  static summaryRecipe = "ConversationHistorySummary";

  async prepare(
    @ingredient("ConversationHistory")
    conversationHistory: ConversationHistoryType
  ): Promise<ConversationHistoryType> {
    console.log("ConversationHistorySummary input:", conversationHistory);

    const conversationHistoryCopy = { ...conversationHistory };

    conversationHistoryCopy.messages =
      conversationHistoryCopy.messages.slice(-5);

    return conversationHistoryCopy;
  }
}
