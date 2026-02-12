/**
 * Task Model Unit Tests
 * 
 * These tests demonstrate how to:
 * 1. Test Mongoose model with references to other models
 * 2. Test schema validation and defaults
 * 3. Test enum values for status and priority
 * 4. Test CRUD operations on tasks
 */

import mongoose from 'mongoose';
import Task from '../task.js';
import User from '../user.js';

describe('Task Model', () => {
  let testUserId: mongoose.Types.ObjectId;

  // Create a test user before each test
  beforeEach(async () => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    });
    testUserId = user._id;
  });

  // Valid task data for testing
  const createValidTaskData = (overrides: any = {}) => ({
    userId: testUserId,
    title: 'Test Task',
    description: 'Test Description',
    ...overrides,
  });

  describe('Task Creation', () => {
    it('should create a new task with valid data', async () => {
      // Arrange
      const taskData = createValidTaskData();

      // Act
      const task = await Task.create(taskData);

      // Assert
      expect(task).toBeDefined();
      expect(task.title).toBe(taskData.title);
      expect(task.description).toBe(taskData.description);
      expect(task.userId.toString()).toBe(testUserId.toString());
      expect(task._id).toBeDefined();
      expect(task.createdAt).toBeDefined();
      expect(task.updatedAt).toBeDefined();
    });

    it('should trim title whitespace', async () => {
      // Arrange
      const taskData = createValidTaskData({
        title: '  Test Task  ',
      });

      // Act
      const task = await Task.create(taskData);

      // Assert
      expect(task.title).toBe('Test Task');
    });

    it('should trim description whitespace', async () => {
      // Arrange
      const taskData = createValidTaskData({
        description: '  Test Description  ',
      });

      // Act
      const task = await Task.create(taskData);

      // Assert
      expect(task.description).toBe('Test Description');
    });
  });

  describe('Required Fields Validation', () => {
    it('should fail when title is not provided', async () => {
      // Arrange
      const taskData = {
        userId: testUserId,
        description: 'Test Description',
      };

      // Act & Assert
      await expect(Task.create(taskData)).rejects.toThrow(
        mongoose.Error.ValidationError
      );
    });

    it('should fail when userId is not provided', async () => {
      // Arrange
      const taskData = {
        title: 'Test Task',
        description: 'Test Description',
      };

      // Act & Assert
      await expect(Task.create(taskData)).rejects.toThrow(
        mongoose.Error.ValidationError
      );
    });
  });

  describe('Default Values', () => {
    it('should set default priority to medium', async () => {
      // Arrange
      const taskData = createValidTaskData();

      // Act
      const task = await Task.create(taskData);

      // Assert
      expect(task.priority).toBe('medium');
    });

    it('should set default status to todo', async () => {
      // Arrange
      const taskData = createValidTaskData();

      // Act
      const task = await Task.create(taskData);

      // Assert
      expect(task.status).toBe('todo');
    });

    it('should set default createdByChat to true', async () => {
      // Arrange
      const taskData = createValidTaskData();

      // Act
      const task = await Task.create(taskData);

      // Assert
      expect(task.createdByChat).toBe(true);
    });

    it('should allow overriding default values', async () => {
      // Arrange
      const taskData = createValidTaskData({
        priority: 'high',
        status: 'in-progress',
        createdByChat: false,
      });

      // Act
      const task = await Task.create(taskData);

      // Assert
      expect(task.priority).toBe('high');
      expect(task.status).toBe('in-progress');
      expect(task.createdByChat).toBe(false);
    });
  });

  describe('Priority Validation', () => {
    it('should accept valid priority values', async () => {
      // Arrange
      const validPriorities = ['low', 'medium', 'high'];

      // Act & Assert
      for (const priority of validPriorities) {
        const task = await Task.create(
          createValidTaskData({
            title: `Task with ${priority} priority`,
            priority,
          })
        );
        expect(task.priority).toBe(priority);
      }
    });

    it('should fail when priority is invalid', async () => {
      // Arrange
      const taskData = createValidTaskData({
        priority: 'invalid-priority',
      });

      // Act & Assert
      await expect(Task.create(taskData)).rejects.toThrow(
        mongoose.Error.ValidationError
      );
    });
  });

  describe('Status Validation', () => {
    it('should accept valid status values', async () => {
      // Arrange
      const validStatuses = ['todo', 'in-progress', 'completed'];

      // Act & Assert
      for (const status of validStatuses) {
        const task = await Task.create(
          createValidTaskData({
            title: `Task with ${status} status`,
            status,
          })
        );
        expect(task.status).toBe(status);
      }
    });

    it('should fail when status is invalid', async () => {
      // Arrange
      const taskData = createValidTaskData({
        status: 'invalid-status',
      });

      // Act & Assert
      await expect(Task.create(taskData)).rejects.toThrow(
        mongoose.Error.ValidationError
      );
    });
  });

  describe('Due Date', () => {
    it('should accept due date', async () => {
      // Arrange
      const dueDate = new Date('2024-12-31');
      const taskData = createValidTaskData({ dueDate });

      // Act
      const task = await Task.create(taskData);

      // Assert
      expect(task.dueDate).toEqual(dueDate);
    });

    it('should allow null due date', async () => {
      // Arrange
      const taskData = createValidTaskData();

      // Act
      const task = await Task.create(taskData);

      // Assert
      expect(task.dueDate).toBeUndefined();
    });
  });

  describe('Completed At', () => {
    it('should set completedAt when task is marked completed', async () => {
      // Arrange
      const task = await Task.create(createValidTaskData());
      const completedAt = new Date();

      // Act
      task.status = 'completed';
      task.completedAt = completedAt;
      await task.save();

      // Assert
      expect(task.completedAt).toEqual(completedAt);
    });
  });

  describe('Chat Session Reference', () => {
    it('should accept chat session id', async () => {
      // Arrange
      const chatSessionId = new mongoose.Types.ObjectId();
      const taskData = createValidTaskData({ chatSessionId });

      // Act
      const task = await Task.create(taskData);

      // Assert
      expect(task.chatSessionId?.toString()).toBe(chatSessionId.toString());
    });
  });

  describe('Task Queries', () => {
    it('should find tasks by user id', async () => {
      // Arrange
      await Task.create(createValidTaskData({ title: 'Task 1' }));
      await Task.create(createValidTaskData({ title: 'Task 2' }));

      // Act
      const tasks = await Task.find({ userId: testUserId });

      // Assert
      expect(tasks).toHaveLength(2);
    });

    it('should find tasks by status', async () => {
      // Arrange
      await Task.create(createValidTaskData({ status: 'todo' }));
      await Task.create(createValidTaskData({ status: 'completed' }));

      // Act
      const todoTasks = await Task.find({ userId: testUserId, status: 'todo' });
      const completedTasks = await Task.find({
        userId: testUserId,
        status: 'completed',
      });

      // Assert
      expect(todoTasks).toHaveLength(1);
      expect(completedTasks).toHaveLength(1);
    });

    it('should find tasks by priority', async () => {
      // Arrange
      await Task.create(createValidTaskData({ priority: 'high' }));
      await Task.create(createValidTaskData({ priority: 'low' }));

      // Act
      const highPriorityTasks = await Task.find({
        userId: testUserId,
        priority: 'high',
      });

      // Assert
      expect(highPriorityTasks).toHaveLength(1);
      expect(highPriorityTasks[0].priority).toBe('high');
    });

    it('should sort tasks by createdAt', async () => {
      // Arrange
      const task1 = await Task.create(createValidTaskData({ title: 'Task 1' }));
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      const task2 = await Task.create(createValidTaskData({ title: 'Task 2' }));

      // Act
      const tasks = await Task.find({ userId: testUserId })
        .sort({ createdAt: -1 })
        .limit(10);

      // Assert
      expect(tasks[0]._id.toString()).toBe(task2._id.toString());
      expect(tasks[1]._id.toString()).toBe(task1._id.toString());
    });

    it('should limit number of returned tasks', async () => {
      // Arrange
      for (let i = 0; i < 10; i++) {
        await Task.create(createValidTaskData({ title: `Task ${i}` }));
      }

      // Act
      const tasks = await Task.find({ userId: testUserId }).limit(5);

      // Assert
      expect(tasks).toHaveLength(5);
    });
  });

  describe('Task Updates', () => {
    it('should update task title', async () => {
      // Arrange
      const task = await Task.create(createValidTaskData());

      // Act
      task.title = 'Updated Title';
      await task.save();

      // Assert
      const updatedTask = await Task.findById(task._id);
      expect(updatedTask!.title).toBe('Updated Title');
    });

    it('should update task status', async () => {
      // Arrange
      const task = await Task.create(createValidTaskData());

      // Act
      task.status = 'in-progress';
      await task.save();

      // Assert
      const updatedTask = await Task.findById(task._id);
      expect(updatedTask!.status).toBe('in-progress');
    });

    it('should use findOneAndUpdate to update task', async () => {
      // Arrange
      const task = await Task.create(createValidTaskData());
      const newTitle = 'Updated via findOneAndUpdate';

      // Act
      const updatedTask = await Task.findOneAndUpdate(
        { _id: task._id },
        { title: newTitle, updatedAt: new Date() },
        { new: true }
      );

      // Assert
      expect(updatedTask).toBeDefined();
      expect(updatedTask!.title).toBe(newTitle);
    });
  });

  describe('Task Deletion', () => {
    it('should delete a task', async () => {
      // Arrange
      const task = await Task.create(createValidTaskData());

      // Act
      await Task.deleteOne({ _id: task._id });

      // Assert
      const deletedTask = await Task.findById(task._id);
      expect(deletedTask).toBeNull();
    });

    it('should delete tasks by user id', async () => {
      // Arrange
      await Task.create(createValidTaskData());
      await Task.create(createValidTaskData());

      // Act
      const result = await Task.deleteMany({ userId: testUserId });

      // Assert
      expect(result.deletedCount).toBe(2);
      const remainingTasks = await Task.find({ userId: testUserId });
      expect(remainingTasks).toHaveLength(0);
    });
  });
});
