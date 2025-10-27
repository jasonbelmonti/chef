import z from "zod";

export const ConversationHistorySpec = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      message: z.string(),
    })
  ),
});

export type ConversationHistoryType = z.infer<typeof ConversationHistorySpec>;
