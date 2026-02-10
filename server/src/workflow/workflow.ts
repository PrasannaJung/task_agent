import "dotenv/config";
import { StateGraph, END, START } from "@langchain/langgraph";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { createTaskTool, validateTaskTool, setToolContext, clearToolContext } from "../tools/dbtools.js";
import llm from "../utils/llm.js";
import {
  AgentState,
  AgentStateType,
  PendingTask,
} from "../state/AgentState.js";

const tools = [
  createTaskTool,
  validateTaskTool,
];

const toolNode = new ToolNode(tools);

const llmWithTools = llm.bindTools(tools);

async function chatAgent(state: AgentStateType) {
  const hasPendingTask = state.pendingTask !== undefined;

  const SYSTEM_PROMPT = `
    You are a task management assistant that helps users manage their tasks. 
    ${hasPendingTask
      ? `You are currently gathering information to create a task. Missing fields: ${state.pendingTask?.missingFields?.join(", ") || "none"}. Ask the user for the missing information.`
      : "Have a normal conversation with the user, but based on the conversation if you infer it as task related talk, you can help the user create task in mongodb. Infer the necessary things like title, description, priority, dueDate from the task."
    }
  `;

  const response = await llmWithTools.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    ...state.messages,
  ]);

  return { messages: [response] };
}

async function shouldCallTool(state: AgentStateType) {
  const lastMessage = state.messages[state.messages.length - 1];

  if (lastMessage instanceof AIMessage) {
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      return "tool";
    }
  }

  return "end";
}

async function processToolResult(state: AgentStateType) {
  const lastMessage = state.messages[state.messages.length - 1];

  if (lastMessage.content && typeof lastMessage.content === "string") {
    try {
      const result = JSON.parse(lastMessage.content);

      // If validation returned incomplete task
      if (result.canCreate === false) {
        return {
          pendingTask: {
            ...result.taskData,
            missingFields: result.missingFields,
          },
        };
      }

      // If validation passed or task was created
      if (result.canCreate === true || result.success === true) {
        return { pendingTask: undefined };
      }
    } catch (e) {
      // Not a JSON response, ignore
    }
  }

  return {};
}

const workflow = new StateGraph(AgentState)
  .addNode("chat", chatAgent)
  .addNode("tool", toolNode)
  .addNode("process_result", processToolResult)
  .addEdge(START, "chat")
  .addConditionalEdges("chat", shouldCallTool, {
    tool: "tool",
    end: END,
  })
  .addEdge("tool", "process_result")
  .addEdge("process_result", "chat");

export const agentWorkflow = workflow.compile();

export { chatAgent, shouldCallTool, processToolResult, tools, toolNode };
export type { PendingTask };
