import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash-lite",
  apiKey: "AIzaSyAI8q_ysAr-TKa7D-R3yod0zl69pVISIIk",
});

export default llm;
