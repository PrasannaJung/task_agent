/**
 * Authentication Middleware Unit Tests
 *
 * These tests demonstrate how to:
 * 1. Test Express middleware functions
 * 2. Mock Request, Response, and NextFunction objects
 * 3. Test JWT token generation and verification
 * 4. Test authentication flows (success and failure cases)
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../../model/user.js";
import {
  authMiddleware,
  optionalAuthMiddleware,
  generateToken,
  verifyToken,
  AuthRequest,
} from "../auth.js";

// Mock JWT_SECRET for consistent testing
const TEST_SECRET = "test-secret-key-for-unit-tests";

// Mock environment variable
process.env.JWT_SECRET = TEST_SECRET;

describe("Auth Middleware", () => {
  // Helper function to create mock Response object
  const createMockResponse = () => {
    const res: Partial<Response> = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    return res as Response;
  };

  // Helper function to create mock Request object
  const createMockRequest = (headers: any = {}) => {
    const req: Partial<AuthRequest> = {
      headers,
    };
    return req as AuthRequest;
  };

  const mockNext = jest.fn() as NextFunction;

  // Clear mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("generateToken", () => {
    it("should generate a valid JWT token", () => {
      // Arrange
      const userId = "user123";

      // Act
      const token = generateToken(userId);

      // Assert
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");

      // Verify the token is valid by decoding it
      const decoded = jwt.verify(token, TEST_SECRET) as any;
      expect(decoded.userId).toBe(userId);
    });

    it("should generate token with 7-day expiration", () => {
      // Arrange
      const userId = "user123";
      const mockSign = jest.spyOn(jwt, "sign");

      // Act
      generateToken(userId);

      // Assert
      expect(mockSign).toHaveBeenCalledWith({ userId }, TEST_SECRET, {
        expiresIn: "7d",
      });

      mockSign.mockRestore();
    });
  });

  describe("verifyToken", () => {
    it("should verify a valid token and return decoded data", () => {
      // Arrange
      const userId = "user123";
      const token = jwt.sign({ userId }, TEST_SECRET, { expiresIn: "7d" });

      // Act
      const decoded = verifyToken(token);

      // Assert
      expect(decoded.userId).toBe(userId);
    });

    it("should throw error for invalid token", () => {
      // Arrange
      const invalidToken = "invalid.token.here";

      // Act & Assert
      expect(() => verifyToken(invalidToken)).toThrow();
    });

    it("should throw error for expired token", () => {
      // Arrange
      const userId = "user123";
      const expiredToken = jwt.sign({ userId }, TEST_SECRET, {
        expiresIn: "-1s",
      });

      // Act & Assert
      expect(() => verifyToken(expiredToken)).toThrow();
    });
  });

  describe("authMiddleware", () => {
    it("should call next() when valid token is provided", async () => {
      // Arrange
      const user = await User.create({
        email: "test@example.com",
        password: "hashedpassword123",
      });
      const token = generateToken(user._id.toString());
      const req = createMockRequest({
        authorization: `Bearer ${token}`,
      });
      const res = createMockResponse();

      // Act
      await authMiddleware(req, res, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.userId).toBe(user._id.toString());
    });

    it("should return 401 when no authorization header is provided", async () => {
      // Arrange
      const req = createMockRequest({});
      const res = createMockResponse();

      // Act
      await authMiddleware(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "No token provided" });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when authorization header does not start with Bearer", async () => {
      // Arrange
      const req = createMockRequest({
        authorization: "Basic dXNlcjpwYXNz",
      });
      const res = createMockResponse();

      // Act
      await authMiddleware(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "No token provided" });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when token is invalid", async () => {
      // Arrange
      const req = createMockRequest({
        authorization: "Bearer invalid.token.here",
      });
      const res = createMockResponse();

      // Act
      await authMiddleware(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid token" });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when user is not found", async () => {
      // Arrange
      const nonExistentUserId = "507f1f77bcf86cd799439011";
      const token = generateToken(nonExistentUserId);
      const req = createMockRequest({
        authorization: `Bearer ${token}`,
      });
      const res = createMockResponse();

      // Act
      await authMiddleware(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "User not found" });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("optionalAuthMiddleware", () => {
    it("should call next() when valid token is provided", async () => {
      // Arrange
      const user = await User.create({
        email: "test@example.com",
        password: "hashedpassword123",
      });
      const token = generateToken(user._id.toString());
      const req = createMockRequest({
        authorization: `Bearer ${token}`,
      });
      const res = createMockResponse();

      // Act
      await optionalAuthMiddleware(req, res, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.userId).toBe(user._id.toString());
    });

    it("should call next() without user when no authorization header", async () => {
      // Arrange
      const req = createMockRequest({});
      const res = createMockResponse();

      // Act
      await optionalAuthMiddleware(req, res, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
      expect(req.userId).toBeUndefined();
    });

    it("should call next() without user when token is invalid", async () => {
      // Arrange
      const req = createMockRequest({
        authorization: "Bearer invalid.token.here",
      });
      const res = createMockResponse();

      // Act
      await optionalAuthMiddleware(req, res, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it("should call next() without user when user not found", async () => {
      // Arrange
      const nonExistentUserId = "507f1f77bcf86cd799439011";
      const token = generateToken(nonExistentUserId);
      const req = createMockRequest({
        authorization: `Bearer ${token}`,
      });
      const res = createMockResponse();

      // Act
      await optionalAuthMiddleware(req, res, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });
  });
});
