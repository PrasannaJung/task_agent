/**
 * User Model Unit Tests
 * 
 * These tests demonstrate how to:
 * 1. Test Mongoose model creation and validation
 * 2. Test required fields and constraints
 * 3. Test default values
 * 4. Test schema validation (email format, password length, etc.)
 */

import mongoose from 'mongoose';
import User from '../user.js';

describe('User Model', () => {
  // Valid user data for testing
  const validUserData = {
    email: 'test@example.com',
    password: 'password123',
  };

  describe('User Creation', () => {
    it('should create a new user with valid data', async () => {
      // Arrange & Act
      const user = await User.create(validUserData);

      // Assert
      expect(user).toBeDefined();
      expect(user.email).toBe(validUserData.email);
      expect(user.password).toBe(validUserData.password);
      expect(user._id).toBeDefined();
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    it('should trim email whitespace', async () => {
      // Arrange
      const userData = {
        email: '  test@example.com  ',
        password: 'password123',
      };

      // Act
      const user = await User.create(userData);

      // Assert
      expect(user.email).toBe('test@example.com');
    });

    it('should convert email to lowercase', async () => {
      // Arrange
      const userData = {
        email: 'TEST@EXAMPLE.COM',
        password: 'password123',
      };

      // Act
      const user = await User.create(userData);

      // Assert
      expect(user.email).toBe('test@example.com');
    });
  });

  describe('Required Fields Validation', () => {
    it('should fail when email is not provided', async () => {
      // Arrange
      const userData = {
        password: 'password123',
      };

      // Act & Assert
      await expect(User.create(userData)).rejects.toThrow(
        mongoose.Error.ValidationError
      );
    });

    it('should fail when password is not provided', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
      };

      // Act & Assert
      await expect(User.create(userData)).rejects.toThrow(
        mongoose.Error.ValidationError
      );
    });

    it('should fail when both email and password are not provided', async () => {
      // Arrange
      const userData = {};

      // Act & Assert
      await expect(User.create(userData)).rejects.toThrow(
        mongoose.Error.ValidationError
      );
    });
  });

  describe('Password Validation', () => {
    it('should fail when password is less than 6 characters', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: '12345',
      };

      // Act & Assert
      await expect(User.create(userData)).rejects.toThrow(
        mongoose.Error.ValidationError
      );
    });

    it('should accept password with exactly 6 characters', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: '123456',
      };

      // Act
      const user = await User.create(userData);

      // Assert
      expect(user.password).toBe('123456');
    });
  });

  describe('Email Uniqueness', () => {
    it('should fail when creating user with duplicate email', async () => {
      // Arrange
      await User.create(validUserData);

      // Act & Assert
      await expect(User.create(validUserData)).rejects.toThrow();
    });

    it('should fail when creating user with same email but different case', async () => {
      // Arrange
      await User.create(validUserData);
      const duplicateUser = {
        email: 'TEST@EXAMPLE.COM',
        password: 'password123',
      };

      // Act & Assert
      await expect(User.create(duplicateUser)).rejects.toThrow();
    });
  });

  describe('Default Preferences', () => {
    it('should create user with default preferences', async () => {
      // Arrange & Act
      const user = await User.create(validUserData);

      // Assert
      expect(user.preferences).toBeDefined();
      expect(user.preferences.modelBehavior).toBe('professional');
      expect(user.preferences.responseStyle).toBe('detailed');
      expect(user.preferences.taskReminders).toBe(true);
      expect(user.preferences.priorityLevel).toBe('all');
    });

    it('should allow custom preferences', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        preferences: {
          modelBehavior: 'casual',
          responseStyle: 'concise',
          taskReminders: false,
          priorityLevel: 'high-only',
        },
      };

      // Act
      const user = await User.create(userData);

      // Assert
      expect(user.preferences.modelBehavior).toBe('casual');
      expect(user.preferences.responseStyle).toBe('concise');
      expect(user.preferences.taskReminders).toBe(false);
      expect(user.preferences.priorityLevel).toBe('high-only');
    });
  });

  describe('Preferences Validation', () => {
    it('should accept valid modelBehavior values', async () => {
      // Arrange
      const validBehaviors = ['formal', 'casual', 'friendly', 'professional'];

      // Act & Assert
      for (const behavior of validBehaviors) {
        const user = await User.create({
          email: `test-${behavior}@example.com`,
          password: 'password123',
          preferences: { modelBehavior: behavior },
        });
        expect(user.preferences.modelBehavior).toBe(behavior);
      }
    });

    it('should accept valid responseStyle values', async () => {
      // Arrange
      const validStyles = ['concise', 'detailed', 'step-by-step'];

      // Act & Assert
      for (const style of validStyles) {
        const user = await User.create({
          email: `test-${style}@example.com`,
          password: 'password123',
          preferences: { responseStyle: style },
        });
        expect(user.preferences.responseStyle).toBe(style);
      }
    });

    it('should accept valid priorityLevel values', async () => {
      // Arrange
      const validLevels = ['all', 'high-and-medium', 'high-only'];

      // Act & Assert
      for (const level of validLevels) {
        const user = await User.create({
          email: `test-${level}@example.com`,
          password: 'password123',
          preferences: { priorityLevel: level },
        });
        expect(user.preferences.priorityLevel).toBe(level);
      }
    });
  });

  describe('User Queries', () => {
    it('should find user by email', async () => {
      // Arrange
      const createdUser = await User.create(validUserData);

      // Act
      const foundUser = await User.findOne({ email: validUserData.email });

      // Assert
      expect(foundUser).toBeDefined();
      expect(foundUser!._id.toString()).toBe(createdUser._id.toString());
    });

    it('should find user by id', async () => {
      // Arrange
      const createdUser = await User.create(validUserData);

      // Act
      const foundUser = await User.findById(createdUser._id);

      // Assert
      expect(foundUser).toBeDefined();
      expect(foundUser!.email).toBe(validUserData.email);
    });

    it('should return null when user not found', async () => {
      // Arrange
      const nonExistentId = new mongoose.Types.ObjectId();

      // Act
      const foundUser = await User.findById(nonExistentId);

      // Assert
      expect(foundUser).toBeNull();
    });
  });
});
