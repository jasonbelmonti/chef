import {
  getEncoding,
  getEncodingNameForModel,
  type TiktokenModel,
} from "js-tiktoken";

import { MODEL_ID } from "@examples/utils/constants";

export const encoding = getEncoding(
  getEncodingNameForModel(MODEL_ID as TiktokenModel)
);

export const countTokens = (text: string): number => {
  return encoding.encode(text).length;
};
