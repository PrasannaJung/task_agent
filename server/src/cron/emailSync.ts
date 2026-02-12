import cron from 'node-cron';
import { taskExtractionService } from '../services/taskExtraction.js';

export class EmailSyncCron {
  private task: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;

  /**
   * Start the cron job to run every 3 days at 9:00 AM
   * Cron format: minute hour day-of-month month day-of-week
   * Pattern: 0 9 star/3 * * means: At 9:00 AM, every 3 days
   */
  start() {
    if (this.task) {
      console.log('Email sync cron job is already running');
      return;
    }

    // Run every 3 days at 9:00 AM
    this.task = cron.schedule('0 9 */3 * *', async () => {
      await this.runSync();
    }, {
      timezone: 'UTC' // You can change this to your preferred timezone
    });

    console.log('Email sync cron job scheduled to run every 3 days at 9:00 AM UTC - Pattern: 0 9 */3 * *');
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('Email sync cron job stopped');
    }
  }

  /**
   * Run the sync manually (useful for testing)
   */
  async runSync(): Promise<void> {
    if (this.isRunning) {
      console.log('Email sync is already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();
    
    console.log(`[${startTime.toISOString()}] Starting email sync for all users...`);

    try {
      const results = await taskExtractionService.processAllUsers();
      
      const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
      const usersProcessed = results.length;
      const usersWithTasks = results.filter(r => r.created > 0).length;

      console.log(`[${new Date().toISOString()}] Email sync completed:`);
      console.log(`  - Users processed: ${usersProcessed}`);
      console.log(`  - Users with new tasks: ${usersWithTasks}`);
      console.log(`  - Total tasks created: ${totalCreated}`);
      console.log(`  - Duration: ${Date.now() - startTime.getTime()}ms`);

      // Log individual user results for debugging
      results.forEach(result => {
        if (result.created > 0) {
          console.log(`  - User ${result.userId}: ${result.created} tasks created`);
        }
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error during email sync:`, error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get the status of the cron job
   */
  getStatus() {
    return {
      isScheduled: this.task !== null,
      isRunning: this.isRunning,
      schedule: '0 9 star/3 * * (Every 3 days at 9:00 AM UTC)'
    };
  }
}

// Export singleton instance
export const emailSyncCron = new EmailSyncCron();

// Function to initialize cron on server start
export function initializeEmailSyncCron(): void {
  // Check if we should enable the cron job
  const enableCron = process.env.ENABLE_EMAIL_SYNC_CRON !== 'false';
  
  if (enableCron) {
    emailSyncCron.start();
  } else {
    console.log('Email sync cron job is disabled (ENABLE_EMAIL_SYNC_CRON=false)');
  }
}
