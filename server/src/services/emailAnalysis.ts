import llm from "../utils/llm.js";
import { z } from "zod";

const EmailAnalysisSchema = z.object({
  isActionable: z.boolean(),
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      priority: z.enum(["low", "medium", "high"]),
      inferredPriority: z.string(),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
    }),
  ),
});

export interface ExtractedTask {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  dueDate: Date;
  confidence: number;
  reason: string;
}

export interface EmailData {
  id: string;
  subject: string;
  sender: string;
  receivedAt: Date;
  snippet: string;
  body: string;
  threadId?: string;
}

export class EmailAnalysisService {
  async analyzeEmail(email: EmailData): Promise<ExtractedTask[]> {
    const prompt = this.buildAnalysisPrompt(email);

    try {
      const response = await llm.invoke(prompt);
      const content =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      const parsed = this.parseResponse(content);

      if (!parsed.isActionable || parsed.tasks.length === 0) {
        return [];
      }

      // Calculate due dates based on priority
      const now = new Date();
      const tasks: ExtractedTask[] = parsed.tasks.map((task) => {
        const daysToAdd = this.getDaysForPriority(task.priority);
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + daysToAdd);

        return {
          title: task.title,
          description: this.buildTaskDescription(email, task),
          priority: task.priority,
          dueDate,
          confidence: task.confidence,
          reason: task.reason,
        };
      });

      return tasks;
    } catch (error) {
      console.error("Error analyzing email:", error);
      return [];
    }
  }

  private buildAnalysisPrompt(email: EmailData): string {
    return `Analyze the following email and extract actionable tasks. 

Email Details:
- Subject: ${email.subject}
- From: ${email.sender}
- Date: ${email.receivedAt}
- Body: ${email.body.substring(0, 3000)} ${email.body.length > 3000 ? "..." : ""}

Instructions:
1. Determine if this email contains actionable items that require the recipient to do something
2. If actionable, extract all tasks mentioned or implied in the email
3. For each task, infer the priority based on:
   - Urgent language ("ASAP", "urgent", "immediately", "deadline", "due")
   - Request type (meeting requests, document submissions, approvals)
   - Sender importance (boss, client, important stakeholder)
   - Time sensitivity mentioned
   - Tone and formality

Priority Guidelines:
- HIGH: Urgent requests, deadlines within days, critical business matters, direct requests from superiors/clients with clear urgency
- MEDIUM: Regular work tasks, requests within a week, non-urgent but important items
- LOW: FYI items, suggestions, no specific timeline, general information sharing

Due Date Rules:
- If priority is high: due date = today + 2 days
- If priority is medium: due date = today + 4 days  
- If priority is low: due date = today + 7 days

Respond in JSON format:
{
  "isActionable": boolean,
  "tasks": [
    {
      "title": "Clear, actionable task title (max 100 chars)",
      "description": "Detailed description of what needs to be done",
      "priority": "low|medium|high",
      "inferredPriority": "Explanation of why this priority was chosen",
      "confidence": 0.0-1.0,
      "reason": "Why this task was extracted from the email"
    }
  ]
}

If the email is not actionable (e.g., just a notification, newsletter, or social email), return isActionable: false and empty tasks array.`;
  }

  private parseResponse(content: string): z.infer<typeof EmailAnalysisSchema> {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return EmailAnalysisSchema.parse(parsed);
      } catch (e) {
        console.error("Failed to parse JSON response:", e);
      }
    }

    // Fallback: return empty result
    return { isActionable: false, tasks: [] };
  }

  private getDaysForPriority(priority: string): number {
    switch (priority) {
      case "high":
        return 2;
      case "medium":
        return 4;
      case "low":
      default:
        return 7;
    }
  }

  private buildTaskDescription(email: EmailData, task: any): string {
    return `Task extracted from email:

    Subject: ${email.subject}
    From: ${email.sender}
    Received: ${email.receivedAt.toLocaleDateString()}

    Task Details:
    ${task.description}

    Priority Reasoning:
    ${task.inferredPriority}

    Original Email Snippet:
    ${email.snippet}`;
  }

  async analyzeMultipleEmails(
    emails: EmailData[],
  ): Promise<Map<string, ExtractedTask[]>> {
    const results = new Map<string, ExtractedTask[]>();

    for (const email of emails) {
      const tasks = await this.analyzeEmail(email);
      if (tasks.length > 0) {
        results.set(email.id, tasks);
      }
    }

    return results;
  }
}

export const emailAnalysisService = new EmailAnalysisService();
