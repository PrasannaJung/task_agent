import "dotenv/config";
import promptSync from "prompt-sync";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { agentWorkflow, PendingTask } from "./src/workflow/workflow.js";
import { connectDB } from "./src/db/db.js";

const prompt = promptSync({ sigint: true });

async function main() {
  await connectDB();

  console.log("\n🤖 Task Management Assistant");
  console.log("Type 'quit' or 'exit' to end the conversation\n");

  let messages: BaseMessage[] = [];
  let pendingTask: PendingTask | undefined = undefined;

  while (true) {
    const userInput = prompt("You: ");

    if (
      !userInput ||
      userInput.toLowerCase() === "quit" ||
      userInput.toLowerCase() === "exit"
    ) {
      console.log("\n👋 Goodbye!");
      process.exit(0);
    }

    messages.push(new HumanMessage(userInput));

    const result = await agentWorkflow.invoke({ messages, pendingTask });

    const lastMessage = result.messages[result.messages.length - 1];
    if (
      lastMessage instanceof AIMessage &&
      typeof lastMessage.content === "string"
    ) {
      console.log(`\nAssistant: ${lastMessage.content}\n`);
    }

    messages = result.messages;
    pendingTask = result.pendingTask;
  }
}

main();
