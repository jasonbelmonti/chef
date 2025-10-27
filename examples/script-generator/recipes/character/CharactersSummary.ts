import { cookbook, ingredient } from "@lib/core/context/Cookbook";
import Recipe from "@lib/core/context/Recipe";
import { MODEL_ID } from "../../../utils/constants";
import { ChatOpenAI } from "@langchain/openai";

import { type CharactersSpecType } from "../../specs/character/characters";

const llm = new ChatOpenAI({
  model: MODEL_ID,
  temperature: 0,
});

@cookbook
export class CharactersSummary extends Recipe<string> {
  description = "Compresses the generated characters.";

  async prepare(
    @ingredient("Characters") characters: CharactersSpecType
  ): Promise<string> {
    // straightforward summary generation without LLM
    return characters.characters
      .map(
        (char) =>
          `Name: ${char.name}\nRole: ${char.role}\nDescription: ${char.description}`
      )
      .join("\n\n");
  }
}
