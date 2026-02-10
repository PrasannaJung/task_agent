import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { AgentStateType } from "../state/AgentState.js";
import { 
  updateTaskTool, 
  completeTaskTool, 
  deleteTaskTool 
} from "../tools/dbtools.js";

export async function handleConfirmation(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const { operationDetails, selectedTaskId } = state;
  
  if (!(lastMessage instanceof HumanMessage)) {
    return {};
  }

  const content = (lastMessage.content as string).toLowerCase().trim();
  
  // Check for explicit confirmation keywords
  const confirmKeywords = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'confirm', 'do it', 'go ahead', 'proceed', 'y'];
  const cancelKeywords = ['no', 'nope', 'cancel', 'abort', 'stop', 'don\'t', 'dont', 'n'];
  
  const isConfirmed = confirmKeywords.some(kw => content === kw || content.startsWith(kw + ' '));
  const isCancelled = cancelKeywords.some(kw => content === kw || content.startsWith(kw + ' '));

  if (isConfirmed && operationDetails && selectedTaskId) {
    // Execute the operation
    try {
      let result;
      
      switch (operationDetails.action) {
        case "update":
          result = await updateTaskTool.invoke({
            taskId: selectedTaskId,
            updates: operationDetails.updates || {},
          });
          break;
          
        case "complete":
          result = await completeTaskTool.invoke({
            taskId: selectedTaskId,
          });
          break;
          
        case "delete":
          result = await deleteTaskTool.invoke({
            taskId: selectedTaskId,
          });
          break;
          
        default:
          return {
            awaitingConfirmation: false,
            operationDetails: undefined,
            selectedTaskId: undefined,
          };
      }
      
      if (result.success) {
        return {
          awaitingConfirmation: false,
          operationDetails: undefined,
          selectedTaskId: undefined,
          foundTasks: [],
          messages: [
            ...state.messages,
            new AIMessage(result.message || `Task ${operationDetails.action}d successfully`),
          ],
        };
      } else {
        return {
          awaitingConfirmation: false,
          operationDetails: undefined,
          selectedTaskId: undefined,
          messages: [
            ...state.messages,
            new AIMessage(`Failed to ${operationDetails.action} task: ${result.message || result.error}`),
          ],
        };
      }
    } catch (error: any) {
      return {
        awaitingConfirmation: false,
        operationDetails: undefined,
        selectedTaskId: undefined,
        messages: [
          ...state.messages,
          new AIMessage(`Error: ${error.message || 'Unknown error occurred'}`),
        ],
      };
    }
  }

  if (isCancelled) {
    return {
      awaitingConfirmation: false,
      operationDetails: undefined,
      selectedTaskId: undefined,
      foundTasks: [],
    };
  }

  // If unclear, keep awaiting confirmation
  return {};
}
