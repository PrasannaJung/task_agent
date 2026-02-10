import { tool } from "@langchain/core/tools";
import Task from "../model/task.js";
import { z } from "zod";
import * as chrono from "chrono-node";

// Global context for user ID (set by server before tool execution)
export let toolContext: { userId?: string; chatSessionId?: string } = {};

export const setToolContext = (context: { userId?: string; chatSessionId?: string }) => {
  toolContext = context;
};

export const clearToolContext = () => {
  toolContext = {};
};

export const REQUIRED_FIELDS = ["title"];

export const validateTaskTool = tool(
  async ({ title, description, priority, dueDate, currentMissingFields }) => {
    const missingFields: string[] = [];
    const taskData: any = {};

    if (title) taskData.title = title;
    if (description) taskData.description = description;
    if (priority) taskData.priority = priority;
    if (dueDate) taskData.dueDate = dueDate;

    // Check required fields
    if (!taskData.title) missingFields.push("title");

    // Check if we have all required info
    if (missingFields.length === 0) {
      return {
        canCreate: true,
        taskData,
        message: "All required information collected. Ready to create task.",
      };
    }

    // Return what's collected and what's missing
    const collectedFields = Object.keys(taskData);
    return {
      canCreate: false,
      taskData,
      missingFields,
      message: `I need more information to create this task. Missing: ${missingFields.join(", ")}. Already have: ${collectedFields.length > 0 ? collectedFields.join(", ") : "nothing yet"}.`,
    };
  },
  {
    name: "validate_task",
    description:
      "Validate task information and check for missing required fields before creating",
    schema: z.object({
      title: z.string().optional().describe("The title of the task"),
      description: z
        .string()
        .optional()
        .describe("Detailed description of the task"),
      priority: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Task priority level"),
      dueDate: z
        .string()
        .optional()
        .describe(
          "Due date in natural language (e.g., 'tomorrow', 'next Friday at 3PM', 'in 2 hours'). Will be parsed to ISO format.",
        ),
      currentMissingFields: z
        .array(z.string())
        .optional()
        .describe("Fields that are currently known to be missing"),
    }),
  },
);

export const createTaskTool = tool(
  async ({ title, description, priority, dueDate }) => {
    try {
      if (!toolContext.userId) {
        return {
          success: false,
          error: "User not authenticated",
          message: "You must be logged in to create tasks",
        };
      }

      let parsedDate: Date | undefined;

      if (dueDate) {
        const chronoResult = chrono.parseDate(dueDate);
        if (chronoResult) {
          parsedDate = chronoResult;
        } else {
          parsedDate = new Date(dueDate);
        }
      }

      const task = new Task({
        userId: toolContext.userId,
        title,
        description,
        priority,
        dueDate: parsedDate,
        chatSessionId: toolContext.chatSessionId,
      });

      await task.save();

      return {
        success: true,
        task: task.toObject(),
        message: `Task "${title}" created successfully with ID: ${task._id}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: "Failed to create task",
      };
    }
  },
  {
    name: "create_task",
    description:
      "Create a new task with title, description, priority, and optional due date",
    schema: z.object({
      title: z.string().describe("The title of the task"),
      description: z
        .string()
        .optional()
        .describe("Detailed description of the task"),
      priority: z
        .enum(["low", "medium", "high"])
        .default("medium")
        .describe("Task priority level"),
      dueDate: z
        .string()
        .optional()
        .describe(
          "Due date in natural language (e.g., 'tomorrow', 'next Friday at 3PM', 'in 2 hours'). Will be parsed to ISO format.",
        ),
    }),
  },
);

export const updateTaskTool = tool(
  async ({ taskId, updates }) => {
    try {
      // Only allow updating tasks owned by the current user
      const filter: any = { _id: taskId };
      if (toolContext.userId) {
        filter.userId = toolContext.userId;
      }

      const task = await Task.findOneAndUpdate(
        filter,
        { ...updates, updatedAt: new Date() },
        { new: true },
      );

      if (!task) {
        return {
          success: false,
          error: "Task not found",
          message: `No task found with ID: ${taskId}`,
        };
      }

      return {
        success: true,
        task: task.toObject(),
        message: `Task "${task.title}" updated successfully`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: "Failed to update task",
      };
    }
  },
  {
    name: "update_task",
    description: "Update an existing task with new information",
    schema: z.object({
      taskId: z.string().describe("The ID of the task to update"),
      updates: z
        .object({
          title: z.string().optional().describe("New title for the task"),
          description: z
            .string()
            .optional()
            .describe("New description for the task"),
          priority: z
            .enum(["low", "medium", "high"])
            .optional()
            .describe("New priority level"),
          status: z
            .enum(["todo", "in-progress", "completed"])
            .optional()
            .describe("New status"),
          dueDate: z.string().optional().describe("New due date in ISO format"),
        })
        .describe("The fields to update"),
    }),
  },
);

export const completeTaskTool = tool(
  async ({ taskId }) => {
    try {
      const filter: any = { _id: taskId };
      if (toolContext.userId) {
        filter.userId = toolContext.userId;
      }

      const task = await Task.findOneAndUpdate(
        filter,
        {
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        },
        { new: true },
      );

      if (!task) {
        return {
          success: false,
          error: "Task not found",
          message: `No task found with ID: ${taskId}`,
        };
      }

      return {
        success: true,
        task: task.toObject(),
        message: `Task "${task.title}" marked as completed`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: "Failed to complete task",
      };
    }
  },
  {
    name: "complete_task",
    description: "Mark a task as completed",
    schema: z.object({
      taskId: z.string().describe("The ID of the task to complete"),
    }),
  },
);

export const listTasksTool = tool(
  async ({ status, priority, limit = 10 }) => {
    try {
      if (!toolContext.userId) {
        return {
          success: false,
          error: "User not authenticated",
          message: "You must be logged in to view tasks",
        };
      }

      const filter: any = { userId: toolContext.userId };
      if (status) filter.status = status;
      if (priority) filter.priority = priority;

      const tasks = await Task.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit);

      return {
        success: true,
        tasks: tasks.map((task) => task.toObject()),
        count: tasks.length,
        message: `Found ${tasks.length} task${tasks.length !== 1 ? "s" : ""}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: "Failed to list tasks",
      };
    }
  },
  {
    name: "list_tasks",
    description: "List tasks with optional filtering by status and priority",
    schema: z.object({
      status: z
        .enum(["todo", "in-progress", "completed"])
        .optional()
        .describe("Filter by task status"),
      priority: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Filter by task priority"),
      limit: z
        .number()
        .default(10)
        .describe("Maximum number of tasks to return"),
    }),
  },
);

export const deleteTaskTool = tool(
  async ({ taskId }) => {
    try {
      const filter: any = { _id: taskId };
      if (toolContext.userId) {
        filter.userId = toolContext.userId;
      }

      const task = await Task.findOneAndDelete(filter);

      if (!task) {
        return {
          success: false,
          error: "Task not found",
          message: `No task found with ID: ${taskId}`,
        };
      }

      return {
        success: true,
        task: task.toObject(),
        message: `Task "${task.title}" deleted successfully`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: "Failed to delete task",
      };
    }
  },
  {
    name: "delete_task",
    description: "Delete a task permanently",
    schema: z.object({
      taskId: z.string().describe("The ID of the task to delete"),
    }),
  },
);

export const searchTasksTool = tool(
  async ({ query, status, limit = 10 }) => {
    try {
      if (!toolContext.userId) {
        return {
          success: false,
          error: "User not authenticated",
          message: "You must be logged in to search tasks",
        };
      }

      // Build the base filter
      const filter: any = { userId: toolContext.userId };
      if (status) filter.status = status;

      // Get all tasks for the user (with optional status filter)
      let tasks = await Task.find(filter).sort({ createdAt: -1 });

      if (!query || query.trim() === "") {
        // If no query, return recent tasks
        const limitedTasks = tasks.slice(0, limit);
        return {
          success: true,
          tasks: limitedTasks.map((task) => ({
            ...task.toObject(),
            matchScore: 1,
            matchReason: "Recent task",
          })),
          count: limitedTasks.length,
          message: `Found ${limitedTasks.length} recent task${limitedTasks.length !== 1 ? "s" : ""}`,
        };
      }

      // Score tasks based on relevance
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

      const scoredTasks = tasks.map((task) => {
        const taskObj = task.toObject();
        let score = 0;
        const reasons: string[] = [];

        const titleLower = (taskObj.title || "").toLowerCase();
        const descLower = (taskObj.description || "").toLowerCase();

        // Exact title match
        if (titleLower.includes(queryLower)) {
          score += 100;
          reasons.push("Exact title match");
        }

        // Exact description match
        if (descLower.includes(queryLower)) {
          score += 50;
          reasons.push("Description match");
        }

        // Word-level matching
        for (const word of queryWords) {
          if (titleLower.includes(word)) {
            score += 20;
            if (!reasons.includes("Title word match")) {
              reasons.push("Title word match");
            }
          }
          if (descLower.includes(word)) {
            score += 10;
            if (!reasons.includes("Description word match")) {
              reasons.push("Description word match");
            }
          }
        }

        // Priority bonus for incomplete tasks
        if (taskObj.status !== "completed") {
          score += 5;
        }

        return {
          ...taskObj,
          matchScore: score,
          matchReason: reasons.join(", ") || "No specific match",
        };
      });

      // Filter out zero scores and sort by score
      const relevantTasks = scoredTasks
        .filter((t) => t.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, limit);

      return {
        success: true,
        tasks: relevantTasks,
        count: relevantTasks.length,
        message: relevantTasks.length > 0
          ? `Found ${relevantTasks.length} matching task${relevantTasks.length !== 1 ? "s" : ""}`
          : `No tasks found matching "${query}"`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: "Failed to search tasks",
      };
    }
  },
  {
    name: "search_tasks",
    description: "Search for tasks using natural language query. Returns matching tasks with relevance scores.",
    schema: z.object({
      query: z
        .string()
        .describe("Natural language search query (e.g., 'meeting', 'report', 'buy groceries')"),
      status: z
        .enum(["todo", "in-progress", "completed"])
        .optional()
        .describe("Optional status filter"),
      limit: z
        .number()
        .default(5)
        .describe("Maximum number of tasks to return"),
    }),
  },
);
