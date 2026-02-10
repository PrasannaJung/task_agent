import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { AgentStateType, FoundTask, OperationDetails } from "../state/AgentState.js";
import { searchTasksTool } from "../tools/dbtools.js";
import * as chrono from "chrono-node";

export async function searchTasks(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { userIntent } = state;
  
  if (!userIntent) {
    return {};
  }

  // Don't search for chat operations
  if (userIntent.action === "chat") {
    return {};
  }

  // For list operations, just get recent tasks
  if (userIntent.action === "list") {
    try {
      const result = await searchTasksTool.invoke({
        query: "",
        status: userIntent.extractedInfo?.status as any,
        limit: 10,
      });

      if (result.success) {
        return { foundTasks: (result.tasks as any[]).map(t => ({...t, _id: t._id.toString()})) as FoundTask[] };
      }
    } catch (error) {
      console.error("Error listing tasks:", error);
    }
    return {};
  }

  // For create, update, delete, complete - search for relevant tasks
  let searchQuery = "";
  
  if (userIntent.action === "create") {
    // Search to check for duplicates
    searchQuery = userIntent.extractedInfo?.title || "";
  } else {
    // For modifications, search for the task
    searchQuery = userIntent.extractedInfo?.searchQuery || 
                    userIntent.extractedInfo?.title || 
                    "";
  }

  try {
    const result = await searchTasksTool.invoke({
      query: searchQuery,
      limit: 5,
    });

    if (result.success) {
      const foundTasks = (result.tasks as any[]).map(t => ({...t, _id: t._id.toString()})) as FoundTask[];
      
      // For single match on update/delete/complete, prepare for confirmation
      if (foundTasks.length === 1 && 
          (userIntent.action === "update" || 
           userIntent.action === "delete" || 
           userIntent.action === "complete")) {
        
        const matchedTask = foundTasks[0];
        
        // Parse any date updates using chrono for relative dates
        let parsedDate: string | undefined;
        if (userIntent.extractedInfo?.dueDate) {
          const dateStr = userIntent.extractedInfo.dueDate;
          const chronoResult = chrono.parseDate(dateStr, new Date(), { forwardDate: true });
          if (chronoResult) {
            parsedDate = chronoResult.toISOString();
          }
        }
        
        // For relative date updates (e.g., "move it further by a week"), calculate from current due date
        if (userIntent.action === "update" && 
            userIntent.extractedInfo?.dueDate && 
            matchedTask.dueDate) {
          const dateStr = userIntent.extractedInfo.dueDate.toLowerCase();
          const relativeKeywords = ['further', 'later', 'more', 'extend', 'postpone', 'delay'];
          
          if (relativeKeywords.some(kw => dateStr.includes(kw))) {
            // Parse relative to current due date
            const currentDue = new Date(matchedTask.dueDate);
            const chronoResult = chrono.parseDate(dateStr, currentDue, { forwardDate: true });
            if (chronoResult) {
              parsedDate = chronoResult.toISOString();
            }
          }
        }
        
        const operationDetails: OperationDetails = {
          action: userIntent.action,
          taskId: matchedTask._id,
          updates: {
            ...(userIntent.extractedInfo?.title && { title: userIntent.extractedInfo.title }),
            ...(userIntent.extractedInfo?.description && { description: userIntent.extractedInfo.description }),
            ...(userIntent.extractedInfo?.priority && { priority: userIntent.extractedInfo.priority }),
            ...(userIntent.extractedInfo?.status && { status: userIntent.extractedInfo.status }),
            ...(parsedDate && { dueDate: parsedDate }),
          },
        };
        
        // Only include updates if there are actual changes for update action
        if (userIntent.action === "update" && Object.keys(operationDetails.updates || {}).length === 0) {
          // No updates specified, don't set awaiting confirmation
          return { foundTasks };
        }
        
        return {
          foundTasks,
          selectedTaskId: matchedTask._id,
          awaitingConfirmation: true,
          operationDetails,
        };
      }
      
      // For create with duplicate found
      if (userIntent.action === "create" && foundTasks.length > 0 && foundTasks[0].matchScore > 80) {
        const similarTask = foundTasks[0];
        const operationDetails: OperationDetails = {
          action: "update", // Suggest update instead
          taskId: similarTask._id,
          updates: {},
        };
        
        return {
          foundTasks,
          selectedTaskId: similarTask._id,
          awaitingConfirmation: true,
          operationDetails,
        };
      }
      
      return { foundTasks };
    }
  } catch (error) {
    console.error("Error searching tasks:", error);
  }

  return {};
}
