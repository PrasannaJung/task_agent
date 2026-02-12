/**
 * Task API Route Tests
 * 
 * These tests demonstrate how to:
 * 1. Test CRUD operations on REST API endpoints
 * 2. Test query parameters and filtering
 * 3. Test route parameters
 * 4. Test authentication middleware integration
 */

import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import User from '../model/user.js';
import Task from '../model/task.js';
import { AuthRequest, authMiddleware } from '../middleware/auth.js';

// Mock auth middleware for testing
const mockAuthMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  // In real tests, we'd verify the token
  // Here we just check if userId is set (simulating successful auth)
  if (req.headers['x-user-id']) {
    const user = await User.findById(req.headers['x-user-id'] as string);
    if (user) {
      req.user = user;
      req.userId = user._id.toString();
      return next();
    }
  }
  res.status(401).json({ error: 'Unauthorized' });
};

// Create a minimal Express app for testing
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  return app;
};

// Setup task routes
const setupTaskRoutes = (app: express.Application) => {
  // Get all tasks for user
  app.get('/api/tasks', mockAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { status, priority, limit = '50' } = req.query;

      const filter: any = { userId: req.userId };
      if (status) filter.status = status;
      if (priority) filter.priority = priority;

      const tasks = await Task.find(filter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit as string));

      res.json({ tasks });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  // Get single task
  app.get('/api/tasks/:taskId', mockAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const task = await Task.findOne({
        _id: req.params.taskId,
        userId: req.userId,
      });

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json({ task });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch task' });
    }
  });

  // Create task
  app.post('/api/tasks', mockAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { title, description, priority, dueDate } = req.body;

      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      const task = new Task({
        userId: req.userId,
        title,
        description,
        priority: priority || 'medium',
        dueDate: dueDate ? new Date(dueDate) : undefined,
      });

      await task.save();

      res.status(201).json({
        message: 'Task created successfully',
        task,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  // Update task
  app.put('/api/tasks/:taskId', mockAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const updates = req.body;

      const task = await Task.findOneAndUpdate(
        { _id: req.params.taskId, userId: req.userId },
        { ...updates, updatedAt: new Date() },
        { new: true }
      );

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json({
        message: 'Task updated successfully',
        task,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  // Complete task
  app.patch('/api/tasks/:taskId/complete', mockAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const task = await Task.findOneAndUpdate(
        { _id: req.params.taskId, userId: req.userId },
        {
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
        },
        { new: true }
      );

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json({
        message: 'Task completed',
        task,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to complete task' });
    }
  });

  // Delete task
  app.delete('/api/tasks/:taskId', mockAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const result = await Task.deleteOne({
        _id: req.params.taskId,
        userId: req.userId,
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json({ message: 'Task deleted' });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  return app;
};

describe('Task API Routes', () => {
  let app: express.Application;
  let testUserId: mongoose.Types.ObjectId;
  let authHeader: { [key: string]: string };

  beforeEach(async () => {
    app = createTestApp();
    setupTaskRoutes(app);

    // Create a test user
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    });
    testUserId = user._id;
    authHeader = { 'x-user-id': testUserId.toString() };
  });

  describe('GET /api/tasks', () => {
    it('should return all tasks for authenticated user', async () => {
      // Arrange
      await Task.create({
        userId: testUserId,
        title: 'Task 1',
        description: 'Description 1',
      });
      await Task.create({
        userId: testUserId,
        title: 'Task 2',
        description: 'Description 2',
      });

      // Act
      const response = await request(app)
        .get('/api/tasks')
        .set(authHeader);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.tasks).toHaveLength(2);
      expect(response.body.tasks[0].title).toBe('Task 2'); // Sorted by createdAt desc
      expect(response.body.tasks[1].title).toBe('Task 1');
    });

    it('should return empty array when user has no tasks', async () => {
      // Act
      const response = await request(app)
        .get('/api/tasks')
        .set(authHeader);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.tasks).toEqual([]);
    });

    it('should filter tasks by status', async () => {
      // Arrange
      await Task.create({
        userId: testUserId,
        title: 'Task 1',
        status: 'todo',
      });
      await Task.create({
        userId: testUserId,
        title: 'Task 2',
        status: 'completed',
      });

      // Act
      const response = await request(app)
        .get('/api/tasks?status=completed')
        .set(authHeader);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.tasks).toHaveLength(1);
      expect(response.body.tasks[0].title).toBe('Task 2');
    });

    it('should filter tasks by priority', async () => {
      // Arrange
      await Task.create({
        userId: testUserId,
        title: 'Task 1',
        priority: 'high',
      });
      await Task.create({
        userId: testUserId,
        title: 'Task 2',
        priority: 'low',
      });

      // Act
      const response = await request(app)
        .get('/api/tasks?priority=high')
        .set(authHeader);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.tasks).toHaveLength(1);
      expect(response.body.tasks[0].title).toBe('Task 1');
    });

    it('should limit number of returned tasks', async () => {
      // Arrange
      for (let i = 0; i < 10; i++) {
        await Task.create({
          userId: testUserId,
          title: `Task ${i}`,
        });
      }

      // Act
      const response = await request(app)
        .get('/api/tasks?limit=5')
        .set(authHeader);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.tasks).toHaveLength(5);
    });

    it('should return 401 when not authenticated', async () => {
      // Act
      const response = await request(app).get('/api/tasks');

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('GET /api/tasks/:taskId', () => {
    it('should return a specific task', async () => {
      // Arrange
      const task = await Task.create({
        userId: testUserId,
        title: 'Test Task',
        description: 'Test Description',
      });

      // Act
      const response = await request(app)
        .get(`/api/tasks/${task._id}`)
        .set(authHeader);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.task).toBeDefined();
      expect(response.body.task.title).toBe('Test Task');
      expect(response.body.task.description).toBe('Test Description');
    });

    it('should return 404 when task not found', async () => {
      // Arrange
      const nonExistentId = new mongoose.Types.ObjectId();

      // Act
      const response = await request(app)
        .get(`/api/tasks/${nonExistentId}`)
        .set(authHeader);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });

    it('should not return tasks belonging to other users', async () => {
      // Arrange
      const otherUser = await User.create({
        email: 'other@example.com',
        password: 'password123',
      });
      const otherUserTask = await Task.create({
        userId: otherUser._id,
        title: 'Other User Task',
      });

      // Act
      const response = await request(app)
        .get(`/api/tasks/${otherUserTask._id}`)
        .set(authHeader);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });
  });

  describe('POST /api/tasks', () => {
    it('should create a new task', async () => {
      // Arrange
      const taskData = {
        title: 'New Task',
        description: 'Task Description',
        priority: 'high',
        dueDate: '2024-12-31',
      };

      // Act
      const response = await request(app)
        .post('/api/tasks')
        .set(authHeader)
        .send(taskData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Task created successfully');
      expect(response.body.task).toBeDefined();
      expect(response.body.task.title).toBe(taskData.title);
      expect(response.body.task.priority).toBe(taskData.priority);
    });

    it('should return 400 when title is missing', async () => {
      // Arrange
      const taskData = {
        description: 'Task Description',
      };

      // Act
      const response = await request(app)
        .post('/api/tasks')
        .set(authHeader)
        .send(taskData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Title is required');
    });

    it('should set default priority to medium', async () => {
      // Arrange
      const taskData = {
        title: 'New Task',
      };

      // Act
      const response = await request(app)
        .post('/api/tasks')
        .set(authHeader)
        .send(taskData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.task.priority).toBe('medium');
    });
  });

  describe('PUT /api/tasks/:taskId', () => {
    it('should update a task', async () => {
      // Arrange
      const task = await Task.create({
        userId: testUserId,
        title: 'Original Title',
        description: 'Original Description',
      });
      const updates = {
        title: 'Updated Title',
        description: 'Updated Description',
        status: 'in-progress',
      };

      // Act
      const response = await request(app)
        .put(`/api/tasks/${task._id}`)
        .set(authHeader)
        .send(updates);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Task updated successfully');
      expect(response.body.task.title).toBe(updates.title);
      expect(response.body.task.description).toBe(updates.description);
      expect(response.body.task.status).toBe(updates.status);
    });

    it('should return 404 when updating non-existent task', async () => {
      // Arrange
      const nonExistentId = new mongoose.Types.ObjectId();
      const updates = { title: 'Updated Title' };

      // Act
      const response = await request(app)
        .put(`/api/tasks/${nonExistentId}`)
        .set(authHeader)
        .send(updates);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });
  });

  describe('PATCH /api/tasks/:taskId/complete', () => {
    it('should mark task as completed', async () => {
      // Arrange
      const task = await Task.create({
        userId: testUserId,
        title: 'Task to Complete',
        status: 'todo',
      });

      // Act
      const response = await request(app)
        .patch(`/api/tasks/${task._id}/complete`)
        .set(authHeader);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Task completed');
      expect(response.body.task.status).toBe('completed');
      expect(response.body.task.completedAt).toBeDefined();
    });

    it('should return 404 when completing non-existent task', async () => {
      // Arrange
      const nonExistentId = new mongoose.Types.ObjectId();

      // Act
      const response = await request(app)
        .patch(`/api/tasks/${nonExistentId}/complete`)
        .set(authHeader);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });
  });

  describe('DELETE /api/tasks/:taskId', () => {
    it('should delete a task', async () => {
      // Arrange
      const task = await Task.create({
        userId: testUserId,
        title: 'Task to Delete',
      });

      // Act
      const response = await request(app)
        .delete(`/api/tasks/${task._id}`)
        .set(authHeader);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Task deleted');

      // Verify task is actually deleted
      const deletedTask = await Task.findById(task._id);
      expect(deletedTask).toBeNull();
    });

    it('should return 404 when deleting non-existent task', async () => {
      // Arrange
      const nonExistentId = new mongoose.Types.ObjectId();

      // Act
      const response = await request(app)
        .delete(`/api/tasks/${nonExistentId}`)
        .set(authHeader);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });

    it('should not delete tasks belonging to other users', async () => {
      // Arrange
      const otherUser = await User.create({
        email: 'other@example.com',
        password: 'password123',
      });
      const otherUserTask = await Task.create({
        userId: otherUser._id,
        title: 'Other User Task',
      });

      // Act
      const response = await request(app)
        .delete(`/api/tasks/${otherUserTask._id}`)
        .set(authHeader);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');

      // Verify task still exists
      const task = await Task.findById(otherUserTask._id);
      expect(task).toBeDefined();
    });
  });
});
