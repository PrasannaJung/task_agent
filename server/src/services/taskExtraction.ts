import Task from '../model/task.js';
import User from '../model/user.js';
import { gmailService } from './gmail.js';
import { emailAnalysisService, EmailData } from './emailAnalysis.js';

export class TaskExtractionService {
  async processEmailsForUser(userId: string): Promise<{ created: number; tasks: any[] }> {
    try {
      // Get user details
      const user = await User.findById(userId);
      if (!user || !user.gmailAuth?.connected) {
        throw new Error('Gmail not connected for user');
      }

      // Get last sync time or default to 3 days ago
      const lastSync = user.gmailAuth.lastSyncAt 
        ? new Date(user.gmailAuth.lastSyncAt) 
        : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      // Fetch emails since last sync
      const emails = await gmailService.getEmailsSince(userId, lastSync);
      console.log(`Found ${emails.length} emails for user ${userId} since ${lastSync}`);

      if (emails.length === 0) {
        await gmailService.updateLastSyncAt(userId);
        return { created: 0, tasks: [] };
      }

      // Analyze emails and extract tasks
      const emailTasksMap = await emailAnalysisService.analyzeMultipleEmails(emails);
      
      const createdTasks: any[] = [];
      
      for (const [emailId, tasks] of emailTasksMap) {
        const email: any = emails.find((e: any) => e.id === emailId);
        if (!email) continue;

        for (const taskData of tasks) {
          // Check if task already exists (avoid duplicates)
          const existingTask = await Task.findOne({
            userId,
            'emailSource.emailId': emailId,
            title: taskData.title
          });

          if (existingTask) {
            console.log(`Task already exists for email ${emailId}: ${taskData.title}`);
            continue;
          }

          // Create new task
          const task = new Task({
            userId,
            title: taskData.title,
            description: taskData.description,
            priority: taskData.priority,
            status: 'todo',
            dueDate: taskData.dueDate,
            source: 'email',
            emailSource: {
              emailId: email.id,
              subject: email.subject,
              sender: email.sender,
              receivedAt: email.receivedAt,
              snippet: email.snippet
            },
            createdByChat: false
          });

          await task.save();
          createdTasks.push(task);
          console.log(`Created task from email ${emailId}: ${taskData.title}`);
        }
      }

      // Update last sync time
      await gmailService.updateLastSyncAt(userId);

      return {
        created: createdTasks.length,
        tasks: createdTasks
      };
    } catch (error) {
      console.error(`Error processing emails for user ${userId}:`, error);
      throw error;
    }
  }

  async processAllUsers(): Promise<{ userId: string; created: number }[]> {
    // Find all users with Gmail connected
    const users = await User.find({
      'gmailAuth.connected': true
    });

    const results: { userId: string; created: number }[] = [];

    for (const user of users) {
      try {
        const result = await this.processEmailsForUser(user._id.toString());
        results.push({
          userId: user._id.toString(),
          created: result.created
        });
      } catch (error) {
        console.error(`Failed to process emails for user ${user._id}:`, error);
        results.push({
          userId: user._id.toString(),
          created: 0
        });
      }
    }

    return results;
  }

  async getEmailTasks(userId: string, options: { 
    status?: string; 
    priority?: string;
    limit?: number;
    skip?: number;
  } = {}) {
    const query: any = { 
      userId,
      source: 'email'
    };

    if (options.status) {
      query.status = options.status;
    }

    if (options.priority) {
      query.priority = options.priority;
    }

    const tasks = await Task.find(query)
      .sort({ createdAt: -1 })
      .limit(options.limit || 50)
      .skip(options.skip || 0);

    const total = await Task.countDocuments(query);

    return { tasks, total };
  }

  async getEmailTaskStats(userId: string) {
    const stats = await Task.aggregate([
      {
        $match: {
          userId: new (await import('mongoose')).Types.ObjectId(userId),
          source: 'email'
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const priorityStats = await Task.aggregate([
      {
        $match: {
          userId: new (await import('mongoose')).Types.ObjectId(userId),
          source: 'email'
        }
      },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    return {
      byStatus: stats.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      byPriority: priorityStats.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      total: stats.reduce((sum: number, curr: any) => sum + curr.count, 0)
    };
  }
}

export const taskExtractionService = new TaskExtractionService();
