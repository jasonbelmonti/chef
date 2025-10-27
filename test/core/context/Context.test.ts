import { describe, expect, test } from "bun:test";

import Chef from "@lib/core/context/Chef";
import Recipe from "@lib/core/context/Recipe";

describe("Context", () => {
  test("Basic rendering behavior", async () => {
    const testValue = "test context component 1";
    const conversationComponent = new Recipe({
      name: "Conversation",
      description: "Holds conversation history",
      provider: async () => testValue,
    });

    const ctx = new Chef({ components: [conversationComponent] });

    const renderedContext = await ctx.cook();
    console.log("Rendered Context:", renderedContext);
    // ASSERT
    expect(renderedContext).toEqual(testValue);
  });

  test("Rendering multiple components", async () => {
    const componentA = new Recipe({
      name: "ComponentA",
      description: "First component",
      provider: async () => "Output from Component A",
    });

    const componentB = new Recipe({
      name: "ComponentB",
      description: "Second component",
      provider: async () => "Output from Component B",
    });

    const ctx = new Chef({ components: [componentA, componentB] });

    const renderedContext = await ctx.cook();
    console.log("Rendered Context with multiple components:", renderedContext);
    // ASSERT
    expect(renderedContext).toContain("Output from Component A");
    expect(renderedContext).toContain("Output from Component B");
  });

  test("Component with dependencies", async () => {
    // SETUP
    const dependencyComponent = new Recipe({
      name: "Dependency",
      description: "A dependent component",
      provider: async () => "Dependency output",
    });

    const mainComponent = new Recipe({
      name: "MainComponent",
      description: "Main component with dependencies",
      dependencies: [dependencyComponent],
      provider: async (dep) => {
        return `Main component output with ${dep}`;
      },
    });

    const ctx = new Chef({ components: [mainComponent] });

    // ACT
    const renderedContext = await ctx.cook();
    console.log("Rendered Context with dependencies:", renderedContext);
    // ASSERT
    expect(renderedContext).toEqual(
      "Main component output with Dependency output"
    );
  });
});
