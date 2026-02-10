import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

export interface PendingTask {
  title?: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  missingFields: string[];
}

export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  pendingTask: Annotation<PendingTask | undefined>({
    default: () => {
      return {
        missingFields: [],
        title: "",
        description: "",
        priority: "medium",
        dueDate: "",
      };
    },
    reducer: (x, y) => y,
  }),
});

export type AgentStateType = typeof AgentState.State;
