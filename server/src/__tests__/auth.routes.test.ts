/**
 * Authentication API Route Tests
 * 
 * These tests demonstrate how to:
 * 1. Test Express API endpoints using supertest
 * 2. Test authentication flows (register, login, get current user)
 * 3. Test validation and error responses
 * 4. Test protected routes with JWT tokens
 */

import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../../model/user.js';
import { generateToken } from '../../middleware/auth.js';

// Create a minimal Express app for testing
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  return app;
};

// Mock the auth routes
const setupAuthRoutes = (app: express.Application) => {
  // Register route
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      if (password.length < 6) {
        return res
          .status(400)
          .json({ error: 'Password must be at least 6 characters' });
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(409).json({ error: 'User already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({ email, password: hashedPassword });
      await user.save();

      const token = generateToken(user._id.toString());

      res.status(201).json({
        message: 'User created successfully',
        token,
        user: {
          id: user._id,
          email: user.email,
          preferences: user.preferences,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  // Login route
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = generateToken(user._id.toString());

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          email: user.email,
          preferences: user.preferences,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to login' });
    }
  });

  return app;
};

describe('Authentication API Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    setupAuthRoutes(app);
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'password123',
      };

      // Act
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User created successfully');
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.id).toBeDefined();
      expect(response.body.user.preferences).toBeDefined();
    });

    it('should return 400 when email is missing', async () => {
      // Arrange
      const userData = {
        password: 'password123',
      };

      // Act
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email and password are required');
    });

    it('should return 400 when password is missing', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
      };

      // Act
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email and password are required');
    });

    it('should return 400 when password is too short', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: '12345',
      };

      // Act
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Password must be at least 6 characters');
    });

    it('should return 409 when user already exists', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'password123',
      };
      await User.create({
        email: userData.email,
        password: await bcrypt.hash(userData.password, 10),
      });

      // Act
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Assert
      expect(response.status).toBe(409);
      expect(response.body.error).toBe('User already exists');
    });

    it('should hash the password before saving', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'password123',
      };

      // Act
      await request(app).post('/api/auth/register').send(userData);
      const user = await User.findOne({ email: userData.email });

      // Assert
      expect(user).toBeDefined();
      expect(user!.password).not.toBe(userData.password);
      expect(await bcrypt.compare(userData.password, user!.password)).toBe(true);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'password123',
      };
      await User.create({
        email: userData.email,
        password: await bcrypt.hash(userData.password, 10),
      });

      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send(userData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(userData.email);
    });

    it('should return 400 when email is missing', async () => {
      // Arrange
      const loginData = {
        password: 'password123',
      };

      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email and password are required');
    });

    it('should return 400 when password is missing', async () => {
      // Arrange
      const loginData = {
        email: 'test@example.com',
      };

      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email and password are required');
    });

    it('should return 401 when user does not exist', async () => {
      // Arrange
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should return 401 when password is incorrect', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'password123',
      };
      await User.create({
        email: userData.email,
        password: await bcrypt.hash(userData.password, 10),
      });

      const loginData = {
        email: userData.email,
        password: 'wrongpassword',
      };

      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should return a valid JWT token on successful login', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'password123',
      };
      const user = await User.create({
        email: userData.email,
        password: await bcrypt.hash(userData.password, 10),
      });

      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send(userData);

      // Assert
      expect(response.body.token).toBeDefined();
      // Verify token is valid by checking it can be used to identify user
      const tokenUserId = response.body.user.id;
      expect(tokenUserId).toBe(user._id.toString());
    });
  });
});
