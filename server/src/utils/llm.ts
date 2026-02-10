import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash-lite",
  apiKey: "AIzaSyAiqGxJLiVV43mAv7zoiO4rpjbkhVk6lIo",
});

export default llm;
