import z from "zod";

export const HITLInputSchema = z.object({
  sessionId: z.string().describe("The unique identifier for the HITL session"),
});

export type HITLInputType = z.infer<typeof HITLInputSchema>;
