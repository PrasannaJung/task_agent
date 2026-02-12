import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { gmailService } from '../services/gmail.js';
import { taskExtractionService } from '../services/taskExtraction.js';
import User from '../model/user.js';

const router = Router();

// Get Gmail auth URL
router.get('/auth-url', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUrl = gmailService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// OAuth callback - receives code from Google and redirects to client
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, error: googleError } = req.query;
    
    if (googleError) {
      console.error('Google OAuth error:', googleError);
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      return res.redirect(`${clientUrl}/gmail/callback?status=error&message=${googleError}`);
    }
    
    if (!code || typeof code !== 'string') {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      return res.redirect(`${clientUrl}/gmail/callback?status=error&message=no_code`);
    }

    // Redirect to client with the code - client will handle token exchange
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}/gmail/callback?code=${encodeURIComponent(code)}&status=success`);
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}/gmail/callback?status=error&message=oauth_failed`);
  }
});

// Connect Gmail account (initiate OAuth)
router.post('/connect', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUrl = gmailService.getAuthUrl();
    res.json({ authUrl, message: 'Please visit the auth URL to connect your Gmail account' });
  } catch (error) {
    console.error('Error initiating Gmail connection:', error);
    res.status(500).json({ error: 'Failed to initiate Gmail connection' });
  }
});

// OAuth callback handler for backend
router.post('/oauth-callback', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const userId = (req as any).userId;
    
    console.log('OAuth callback received for user:', userId, 'with code:', code ? 'YES' : 'NO');

    if (!code) {
      console.log('No code provided in request body');
      return res.status(400).json({ error: 'Authorization code required' });
    }

    if (!userId) {
      console.log('No userId found in request');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Exchange code for tokens
    console.log('Exchanging code for tokens...');
    const tokens = await gmailService.getTokens(code);
    console.log('Got tokens from Google:', Object.keys(tokens));
    
    // Save tokens to user
    console.log('Saving tokens to user...');
    await gmailService.saveTokens(userId, tokens);

    console.log('Gmail connection successful for user:', userId);
    res.json({ 
      success: true, 
      message: 'Gmail account connected successfully' 
    });
  } catch (error) {
    console.error('Error saving Gmail tokens:', error);
    res.status(500).json({ error: 'Failed to connect Gmail account' });
  }
});

// Disconnect Gmail account
router.post('/disconnect', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    await gmailService.disconnect(userId);
    res.json({ success: true, message: 'Gmail account disconnected' });
  } catch (error) {
    console.error('Error disconnecting Gmail:', error);
    res.status(500).json({ error: 'Failed to disconnect Gmail account' });
  }
});

// Check Gmail connection status
router.get('/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    console.log('Checking Gmail status for user:', userId);
    const user = await User.findById(userId).select('gmailAuth');
    console.log('User gmailAuth:', user?.gmailAuth);
    
    res.json({
      connected: user?.gmailAuth?.connected || false,
      lastSyncAt: user?.gmailAuth?.lastSyncAt || null
    });
  } catch (error) {
    console.error('Error checking Gmail status:', error);
    res.status(500).json({ error: 'Failed to check Gmail status' });
  }
});

// Sync emails and extract tasks manually
router.post('/sync', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    
    const result = await taskExtractionService.processEmailsForUser(userId);
    
    res.json({
      success: true,
      message: `Synced emails and created ${result.created} tasks`,
      created: result.created,
      tasks: result.tasks
    });
  } catch (error: any) {
    console.error('Error syncing emails:', error);
    res.status(500).json({ 
      error: 'Failed to sync emails',
      message: error.message 
    });
  }
});

// Get email-derived tasks
router.get('/tasks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { status, priority, limit, skip } = req.query;
    
    const result = await taskExtractionService.getEmailTasks(userId, {
      status: status as string,
      priority: priority as string,
      limit: limit ? parseInt(limit as string) : undefined,
      skip: skip ? parseInt(skip as string) : undefined
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching email tasks:', error);
    res.status(500).json({ error: 'Failed to fetch email tasks' });
  }
});

// Get email task statistics
router.get('/tasks/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const stats = await taskExtractionService.getEmailTaskStats(userId);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching email task stats:', error);
    res.status(500).json({ error: 'Failed to fetch email task statistics' });
  }
});

export default router;
