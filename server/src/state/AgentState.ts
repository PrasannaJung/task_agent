import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

export type ActionType = 
  | "create" 
  | "update" 
  | "delete" 
  | "complete" 
  | "list" 
  | "chat";

export interface PendingTask {
  title?: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  missingFields: string[];
}

export interface FoundTask {
  _id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate?: string;
  matchScore: number;
  matchReason: string;
}

export interface UserIntent {
  action: ActionType;
  confidence: number;
  reason: string;
  extractedInfo?: {
    title?: string;
    description?: string;
    priority?: string;
    dueDate?: string;
    status?: string;
    searchQuery?: string;
  };
}

export interface OperationDetails {
  action: ActionType;
  taskId?: string;
  updates?: any;
}

export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  
  // Intent analysis
  userIntent: Annotation<UserIntent | undefined>({
    default: () => undefined,
    reducer: (x, y) => y,
  }),
  
  // Task creation flow
  pendingTask: Annotation<PendingTask | undefined>({
    default: () => undefined,
    reducer: (x, y) => y,
  }),
  
  // Task search results for update/delete/complete
  foundTasks: Annotation<FoundTask[]>({
    default: () => [],
    reducer: (x, y) => y,
  }),
  
  // Selected task for action
  selectedTaskId: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (x, y) => y,
  }),
  
  // Confirmation state
  awaitingConfirmation: Annotation<boolean>({
    default: () => false,
    reducer: (x, y) => y,
  }),
  
  // Current operation details
  operationDetails: Annotation<OperationDetails | undefined>({
    default: () => undefined,
    reducer: (x, y) => y,
  }),
});

export type AgentStateType = typeof AgentState.State;
