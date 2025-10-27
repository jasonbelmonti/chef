import { ChatOpenAI } from "@langchain/openai";
import { MODEL_ID } from "@examples/utils/constants";

const llm = new ChatOpenAI({
  model: MODEL_ID,
  temperature: 0,
});

export { llm };
