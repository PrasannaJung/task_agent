import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { agentWorkflow } from "./src/workflow/workflow.js";
import { setToolContext, clearToolContext } from "./src/tools/dbtools.js";
import { connectDB } from "./src/db/db.js";
import User from "./src/model/user.js";
import Task from "./src/model/task.js";
import ChatSession from "./src/model/chatSession.js";
import {
  authMiddleware,
  AuthRequest,
  generateToken,
} from "./src/middleware/auth.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// Register
app.post("/api/auth/register", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();

    const token = generateToken(user._id.toString());

    res.status(201).json({
      message: "User created successfully",
      token,
      user: {
        id: user._id,
        email: user.email,
        preferences: user.preferences,
      },
    });
  } catch (error: any) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// Login
app.post("/api/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user._id.toString());

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        preferences: user.preferences,
      },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

// Get current user
app.get("/api/auth/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    res.json({
      user: {
        id: req.user._id,
        email: req.user.email,
        preferences: req.user.preferences,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to get user" });
  }
});

// ==========================================
// CHAT ROUTES
// ==========================================

// Send message to chat
app.post("/api/chat", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { message, sessionId } = req.body;
    const userId = req.userId!;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Get or create chat session
    let chatSession;
    if (sessionId) {
      chatSession = await ChatSession.findOne({ _id: sessionId, userId });
    }

    if (!chatSession) {
      // Create new session
      chatSession = new ChatSession({
        userId,
        title: message.slice(0, 50) + (message.length > 50 ? "..." : ""),
        messages: [],
        pendingTask: null,
        isActive: true,
      });
    }

    // Add user message
    chatSession.messages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    // Prepare messages for workflow
    const messages: BaseMessage[] = chatSession.messages.map((m: any) => {
      if (m.role === "user") {
        return new HumanMessage(m.content);
      } else {
        return new AIMessage(m.content);
      }
    });

    // Set tool context with user info
    setToolContext({
      userId,
      chatSessionId: chatSession._id.toString(),
    });

    // Run workflow
    const result = await agentWorkflow.invoke({
      messages,
      pendingTask: chatSession.pendingTask || undefined,
      userIntent: chatSession.userIntent || undefined,
      foundTasks: chatSession.foundTasks || [],
      selectedTaskId: chatSession.selectedTaskId || undefined,
      awaitingConfirmation: chatSession.awaitingConfirmation || false,
      operationDetails: chatSession.operationDetails || undefined,
    });

    // Clear tool context
    clearToolContext();

    // Get AI response
    const lastMessage = result.messages[result.messages.length - 1];
    let responseText = "";

    if (lastMessage instanceof AIMessage) {
      if (typeof lastMessage.content === "string") {
        responseText = lastMessage.content;
      } else if (Array.isArray(lastMessage.content)) {
        responseText = lastMessage.content
          .map((item: any) =>
            typeof item === "string" ? item : JSON.stringify(item)
          )
          .join(" ");
      }
    }

    // Add AI response to chat history
    chatSession.messages.push({
      role: "assistant",
      content: responseText,
      timestamp: new Date(),
    });

    // Update all state fields
    chatSession.pendingTask = result.pendingTask || null;
    chatSession.userIntent = result.userIntent || null;
    chatSession.foundTasks = result.foundTasks || [];
    chatSession.selectedTaskId = result.selectedTaskId || null;
    chatSession.awaitingConfirmation = result.awaitingConfirmation || false;
    chatSession.operationDetails = result.operationDetails || null;
    chatSession.lastActivity = new Date();

    // Save checkpoint
    chatSession.checkpoints.push({
      nodeId: "end",
      state: {
        pendingTask: result.pendingTask,
        userIntent: result.userIntent,
        foundTasks: result.foundTasks,
        selectedTaskId: result.selectedTaskId,
        awaitingConfirmation: result.awaitingConfirmation,
        operationDetails: result.operationDetails,
        messageCount: result.messages.length,
      },
      timestamp: new Date(),
    });

    await chatSession.save();

    res.json({
      response: responseText,
      sessionId: chatSession._id,
      hasPendingTask: !!result.pendingTask,
      pendingTask: result.pendingTask,
      userIntent: result.userIntent,
      foundTasks: result.foundTasks,
      awaitingConfirmation: result.awaitingConfirmation,
      operationDetails: result.operationDetails,
    });
  } catch (error: any) {
    clearToolContext();
    console.error("Error processing chat:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all chat sessions for user
app.get("/api/chat/sessions", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await ChatSession.find({ userId: req.userId })
      .select("_id title lastActivity isActive createdAt")
      .sort({ lastActivity: -1 });

    res.json({ sessions });
  } catch (error: any) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// Get specific chat session
app.get("/api/chat/sessions/:sessionId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const session = await ChatSession.findOne({
      _id: req.params.sessionId,
      userId: req.userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json({
      session: {
        id: session._id,
        title: session.title,
        messages: session.messages,
        pendingTask: session.pendingTask,
        userIntent: session.userIntent,
        foundTasks: session.foundTasks,
        selectedTaskId: session.selectedTaskId,
        awaitingConfirmation: session.awaitingConfirmation,
        operationDetails: session.operationDetails,
        isActive: session.isActive,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
      },
    });
  } catch (error: any) {
    console.error("Error fetching session:", error);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

// Delete chat session
app.delete("/api/chat/sessions/:sessionId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await ChatSession.deleteOne({
      _id: req.params.sessionId,
      userId: req.userId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json({ message: "Session deleted" });
  } catch (error: any) {
    console.error("Error deleting session:", error);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

// ==========================================
// TASK ROUTES
// ==========================================

// Get all tasks for user
app.get("/api/tasks", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { status, priority, limit = "50" } = req.query;

    const filter: any = { userId: req.userId };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const tasks = await Task.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string));

    res.json({ tasks });
  } catch (error: any) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// Get single task
app.get("/api/tasks/:taskId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const task = await Task.findOne({
      _id: req.params.taskId,
      userId: req.userId,
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ task });
  } catch (error: any) {
    console.error("Error fetching task:", error);
    res.status(500).json({ error: "Failed to fetch task" });
  }
});

// Create task manually
app.post("/api/tasks", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, priority, dueDate } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const task = new Task({
      userId: req.userId,
      title,
      description,
      priority: priority || "medium",
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });

    await task.save();

    res.status(201).json({
      message: "Task created successfully",
      task,
    });
  } catch (error: any) {
    console.error("Error creating task:", error);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// Update task
app.put("/api/tasks/:taskId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const updates = req.body;

    const task = await Task.findOneAndUpdate(
      { _id: req.params.taskId, userId: req.userId },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({
      message: "Task updated successfully",
      task,
    });
  } catch (error: any) {
    console.error("Error updating task:", error);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// Complete task
app.patch("/api/tasks/:taskId/complete", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.taskId, userId: req.userId },
      {
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      },
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({
      message: "Task completed",
      task,
    });
  } catch (error: any) {
    console.error("Error completing task:", error);
    res.status(500).json({ error: "Failed to complete task" });
  }
});

// Delete task
app.delete("/api/tasks/:taskId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await Task.deleteOne({
      _id: req.params.taskId,
      userId: req.userId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ message: "Task deleted" });
  } catch (error: any) {
    console.error("Error deleting task:", error);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Start server
async function startServer() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API endpoints:`);
    console.log(`   POST /api/auth/register - Register new user`);
    console.log(`   POST /api/auth/login - Login user`);
    console.log(`   GET  /api/auth/me - Get current user`);
    console.log(`   POST /api/chat - Send message to assistant`);
    console.log(`   GET  /api/chat/sessions - Get all chat sessions`);
    console.log(`   GET  /api/chat/sessions/:id - Get specific session`);
    console.log(`   DELETE /api/chat/sessions/:id - Delete session`);
    console.log(`   GET  /api/tasks - Get all tasks`);
    console.log(`   GET  /api/tasks/:id - Get specific task`);
    console.log(`   POST /api/tasks - Create new task`);
    console.log(`   PUT  /api/tasks/:id - Update task`);
    console.log(`   PATCH /api/tasks/:id/complete - Complete task`);
    console.log(`   DELETE /api/tasks/:id - Delete task`);
  });
}

startServer().catch(console.error);

export default app;
