import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import llm from "../utils/llm.js";
import { AgentStateType, UserIntent, ActionType } from "../state/AgentState.js";

const INTENT_ANALYSIS_PROMPT = `You are an intent analysis system for a task management AI.

Analyze the user's message and determine their intent from these categories:
- "create": User wants to create a new task (e.g., "remind me to...", "I need to...", "add a task")
- "update": User wants to modify an existing task (e.g., "change the due date...", "update...", "move...")
- "delete": User wants to remove a task (e.g., "delete...", "remove...", "cancel...")
- "complete": User wants to mark a task as done (e.g., "mark as done", "complete...", "finish...", "I finished...", "done with...")
- "list": User wants to see their tasks (e.g., "show my tasks", "what do I have...", "list...")
- "chat": General conversation not related to task operations

Extract relevant information:
- For create: title, description, priority (low/medium/high), due date
- For update: search terms to find the task, what to update
- For delete: search terms to find the task to delete
- For complete: search terms to find the task to complete
- For list: any filters (status, priority)

Respond ONLY with a JSON object in this format:
{
  "action": "create|update|delete|complete|list|chat",
  "confidence": 0.0-1.0,
  "reason": "brief explanation of why this action was chosen",
  "extractedInfo": {
    "title": "extracted or inferred title",
    "description": "extracted description",
    "priority": "low|medium|high",
    "dueDate": "extracted date (natural language)",
    "status": "todo|in-progress|completed",
    "searchQuery": "search terms for finding existing tasks"
  }
}

Be smart about inference:
- If user says "I finished the report", they likely want to complete a task about a report
- If user says "move my meeting to Friday", they want to update a meeting task's due date
- If user mentions a task without specifying action but uses completion words, assume complete
- Extract as much information as possible from context`;

export async function analyzeIntent(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];
  
  if (!(lastMessage instanceof HumanMessage)) {
    return {};
  }

  try {
    const response = await llm.invoke([
      new SystemMessage(INTENT_ANALYSIS_PROMPT),
      new HumanMessage(`Analyze this message: "${lastMessage.content}"`),
    ]);

    let content = response.content;
    if (typeof content !== "string") {
      content = JSON.stringify(content);
    }

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || 
                      content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      console.error("Could not parse intent analysis response:", content);
      return {
        userIntent: {
          action: "chat",
          confidence: 0.5,
          reason: "Could not determine intent",
        },
      };
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    const intent: UserIntent = {
      action: parsed.action as ActionType,
      confidence: parsed.confidence || 0.5,
      reason: parsed.reason || "No reason provided",
      extractedInfo: parsed.extractedInfo || {},
    };

    return { userIntent: intent };
  } catch (error) {
    console.error("Error analyzing intent:", error);
    return {
      userIntent: {
        action: "chat",
        confidence: 0.5,
        reason: "Error during intent analysis",
      },
    };
  }
}
