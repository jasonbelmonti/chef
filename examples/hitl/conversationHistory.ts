import fs from "fs";

const LOG_PATH = "./examples/hitl/logs/";

export const loadSessionLog = (sessionId: string) => {
  const logPath = `${LOG_PATH}session_${sessionId}.json`;
  if (fs.existsSync(logPath)) {
    return JSON.parse(fs.readFileSync(logPath, "utf-8"));
  }
  return null;
};

export const createSessionLog = (sessionId: string) => {
  const logPath = `${LOG_PATH}session_${sessionId}.json`;
  fs.writeFileSync(logPath, "{}");
};

export const addMessage = (
  sessionId: string,
  role: "user" | "system" | "assistant",
  message: string
) => {
  const logPath = `${LOG_PATH}session_${sessionId}.json`;
  let sessionLog = loadSessionLog(sessionId) || { messages: [] };
  sessionLog.messages.push({ role, message });
  fs.writeFileSync(logPath, JSON.stringify(sessionLog, null, 2));
};
