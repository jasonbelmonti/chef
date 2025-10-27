import z from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { StateGraph, START, END } from "@langchain/langgraph";

export const createTestGraph = (annotation: z.ZodObject) => {
  const graph = new StateGraph(annotation);

  // Add test nodes and edges as needed
  graph
    .addNode(
      "node_1",
      async (state: z.infer<typeof annotation>, config: RunnableConfig) => {
        console.log("In node_1 with state:", state);
        return {
          messages: ["test"],
        };
      }
    )
    .addEdge(START, "node_1")
    .addEdge("node_1", END);

  return graph;
};
