import "dotenv/config";
import { StateGraph, END, START } from "@langchain/langgraph";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  BaseMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  createTaskTool,
  validateTaskTool,
  updateTaskTool,
  completeTaskTool,
  deleteTaskTool,
  listTasksTool,
  searchTasksTool,
  setToolContext,
  clearToolContext,
} from "../tools/dbtools.js";
import llm from "../utils/llm.js";
import {
  AgentState,
  AgentStateType,
  PendingTask,
  UserIntent,
} from "../state/AgentState.js";
import { analyzeIntent } from "../nodes/intentAnalyzer.js";
import { searchTasks } from "../nodes/taskSearch.js";
import { handleConfirmation } from "../nodes/confirmationHandler.js";

const tools = [
  createTaskTool,
  validateTaskTool,
  updateTaskTool,
  completeTaskTool,
  deleteTaskTool,
  listTasksTool,
  searchTasksTool,
];

const toolNode = new ToolNode(tools);

const llmWithTools = llm.bindTools(tools);

// ============================================
// ROUTING FUNCTIONS
// ============================================

function routeAfterIntent(state: AgentStateType): string {
  const { userIntent, awaitingConfirmation } = state;

  // If awaiting confirmation, handle it first
  if (awaitingConfirmation) {
    return "confirmation";
  }

  if (!userIntent) {
    return "chat";
  }

  switch (userIntent.action) {
    case "create":
      return "search"; // Still search to avoid duplicates
    case "update":
    case "delete":
    case "complete":
      return "search";
    case "list":
      return "search";
    case "chat":
    default:
      return "chat";
  }
}

function routeAfterSearch(state: AgentStateType): string {
  const { userIntent, foundTasks, pendingTask } = state;

  if (!userIntent) {
    return "chat";
  }

  switch (userIntent.action) {
    case "create":
      // Check if similar task already exists
      const similarTask = foundTasks.find(
        (t) => t.matchScore > 80 && t.status !== "completed"
      );
      if (similarTask) {
        return "confirmation"; // Will ask if they want to update instead
      }
      return "chat"; // Proceed to task creation flow

    case "update":
    case "delete":
    case "complete":
      if (foundTasks.length === 0) {
        return "chat"; // No tasks found, inform user
      }
      if (foundTasks.length === 1) {
        return "confirmation"; // Single match, confirm it
      }
      return "chat"; // Multiple matches, let user choose

    case "list":
      return "chat"; // Show the list

    default:
      return "chat";
  }
}

function routeAfterConfirmation(state: AgentStateType): string {
  const { awaitingConfirmation } = state;

  if (awaitingConfirmation) {
    return "chat"; // Still waiting for user response
  }

  // Confirmation was handled (executed or cancelled), go to chat to respond
  return "chat";
}

function shouldCallTool(state: AgentStateType): "tools" | "end" {
  const lastMessage = state.messages[state.messages.length - 1];

  if (lastMessage instanceof AIMessage) {
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      return "tools";
    }
  }

  return "end";
}

// ============================================
// NODE FUNCTIONS
// ============================================

async function chatAgent(state: AgentStateType) {
  const {
    userIntent,
    foundTasks,
    pendingTask,
    awaitingConfirmation,
    operationDetails,
    messages,
  } = state;

  let systemPrompt = `You are a helpful task management assistant. You help users create, update, complete, and delete tasks.

CURRENT CONTEXT:
`;

  // Add intent information
  if (userIntent) {
    systemPrompt += `- User wants to: ${userIntent.action} (confidence: ${Math.round(userIntent.confidence * 100)}%)\n`;
    if (userIntent.reason) {
      systemPrompt += `- Reason: ${userIntent.reason}\n`;
    }
  }

  // Add pending task info for creation flow
  if (pendingTask) {
    systemPrompt += `- Creating task. Missing fields: ${pendingTask.missingFields.join(", ") || "none"}\n`;
    if (pendingTask.title) systemPrompt += `- Title so far: ${pendingTask.title}\n`;
    if (pendingTask.dueDate) systemPrompt += `- Due date: ${pendingTask.dueDate}\n`;
    if (pendingTask.priority) systemPrompt += `- Priority: ${pendingTask.priority}\n`;
  }

  // Add found tasks for modification flows
  if (foundTasks.length > 0 && userIntent && userIntent.action !== "create") {
    systemPrompt += `- Found ${foundTasks.length} relevant task(s):\n`;
    foundTasks.slice(0, 3).forEach((task, idx) => {
      systemPrompt += `  ${idx + 1}. "${task.title}" (${task.status}, ${task.priority} priority)\n`;
      if (task.dueDate) {
        systemPrompt += `     Due: ${new Date(task.dueDate).toLocaleDateString()}\n`;
      }
    });
  }

  // Add confirmation context
  if (awaitingConfirmation && operationDetails) {
    systemPrompt += `- AWAITING USER CONFIRMATION for: ${operationDetails.action}\n`;
    if (operationDetails.taskId) {
      const task = foundTasks.find((t) => t._id === operationDetails.taskId);
      if (task) {
        systemPrompt += `- Task: "${task.title}"\n`;
      }
    }
  }

  systemPrompt += `
INSTRUCTIONS:
- Be conversational and friendly
- For task creation: Gather missing info naturally, don't be repetitive
- When tasks are found: Ask user to confirm which one they mean (1, 2, 3, etc.)
- For single matches: Ask "Did you mean '[task title]'?"
- When confirming: Ask clearly what action to take
- If no tasks match: Say so clearly and suggest alternatives
- Use tools when ready to execute actions`;

  const response = await llmWithTools.invoke([
    new SystemMessage(systemPrompt),
    ...messages,
  ]);

  return { messages: [response] };
}

async function processToolResult(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];

  if (lastMessage instanceof ToolMessage) {
    try {
      const result = JSON.parse(lastMessage.content as string);

      // Handle validation result for task creation
      if (result.canCreate !== undefined) {
        if (result.canCreate === false) {
          return {
            pendingTask: {
              ...result.taskData,
              missingFields: result.missingFields,
            },
          };
        } else {
          return { pendingTask: undefined };
        }
      }

      // Handle successful operations
      if (result.success) {
        // Clear operation state after successful execution
        return {
          pendingTask: undefined,
          awaitingConfirmation: false,
          operationDetails: undefined,
          selectedTaskId: undefined,
          foundTasks: [],
        };
      }
    } catch (e) {
      // Not JSON or parsing error, ignore
    }
  }

  return {};
}

// ============================================
// WORKFLOW DEFINITION
// ============================================

const workflow = new StateGraph(AgentState)
  // Add nodes
  .addNode("analyze_intent", analyzeIntent)
  .addNode("search_tasks", searchTasks)
  .addNode("handle_confirmation", handleConfirmation)
  .addNode("chat", chatAgent)
  .addNode("tools", toolNode)
  .addNode("process_result", processToolResult)

  // Define edges
  .addEdge(START, "analyze_intent")
  
  .addConditionalEdges("analyze_intent", routeAfterIntent, {
    search: "search_tasks",
    confirmation: "handle_confirmation",
    chat: "chat",
  })
  
  .addConditionalEdges("search_tasks", routeAfterSearch, {
    confirmation: "handle_confirmation",
    chat: "chat",
  })
  
  .addConditionalEdges("handle_confirmation", routeAfterConfirmation, {
    chat: "chat",
    end: END,
  })
  
  .addConditionalEdges("chat", shouldCallTool, {
    tools: "tools",
    end: END,
  })
  
  .addEdge("tools", "process_result")
  .addEdge("process_result", "chat");

export const agentWorkflow = workflow.compile();

export {
  chatAgent,
  analyzeIntent,
  searchTasks,
  handleConfirmation,
  processToolResult,
  tools,
  toolNode,
  routeAfterIntent,
  routeAfterSearch,
};
export type { PendingTask, UserIntent };
