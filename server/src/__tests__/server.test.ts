/**
 * Server Integration Tests
 * 
 * These tests demonstrate how to:
 * 1. Test Express application setup
 * 2. Test middleware (CORS, JSON parsing)
 * 3. Test health check endpoints
 * 4. Test error handling
 */

import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';

describe('Server Integration Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('Express App Setup', () => {
    it('should parse JSON request bodies', async () => {
      // Arrange
      app.post('/test-json', (req: Request, res: Response) => {
        res.json({ received: req.body });
      });

      const testData = { message: 'Hello World', number: 42 };

      // Act
      const response = await request(app)
        .post('/test-json')
        .send(testData)
        .set('Content-Type', 'application/json');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.received).toEqual(testData);
    });

    it('should handle empty request body', async () => {
      // Arrange
      app.post('/test-empty', (req: Request, res: Response) => {
        res.json({ received: req.body, isEmpty: Object.keys(req.body).length === 0 });
      });

      // Act
      const response = await request(app)
        .post('/test-empty')
        .send({});

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.isEmpty).toBe(true);
    });

    it('should handle different HTTP methods', async () => {
      // Arrange
      app.get('/test-method', (req: Request, res: Response) => {
        res.json({ method: 'GET' });
      });
      app.post('/test-method', (req: Request, res: Response) => {
        res.json({ method: 'POST' });
      });
      app.put('/test-method', (req: Request, res: Response) => {
        res.json({ method: 'PUT' });
      });
      app.delete('/test-method', (req: Request, res: Response) => {
        res.json({ method: 'DELETE' });
      });
      app.patch('/test-method', (req: Request, res: Response) => {
        res.json({ method: 'PATCH' });
      });

      // Act & Assert
      const getResponse = await request(app).get('/test-method');
      expect(getResponse.body.method).toBe('GET');

      const postResponse = await request(app).post('/test-method');
      expect(postResponse.body.method).toBe('POST');

      const putResponse = await request(app).put('/test-method');
      expect(putResponse.body.method).toBe('PUT');

      const deleteResponse = await request(app).delete('/test-method');
      expect(deleteResponse.body.method).toBe('DELETE');

      const patchResponse = await request(app).patch('/test-method');
      expect(patchResponse.body.method).toBe('PATCH');
    });
  });

  describe('Health Check Endpoint', () => {
    it('should return ok status', async () => {
      // Arrange
      app.get('/health', (req: Request, res: Response) => {
        res.json({ status: 'ok' });
      });

      // Act
      const response = await request(app).get('/health');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    it('should return JSON content type', async () => {
      // Arrange
      app.get('/health', (req: Request, res: Response) => {
        res.json({ status: 'ok' });
      });

      // Act
      const response = await request(app).get('/health');

      // Assert
      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('Error Handling', () => {
    it('should handle synchronous errors', async () => {
      // Arrange
      app.get('/error-sync', (req: Request, res: Response) => {
        throw new Error('Synchronous error');
      });

      // Error handling middleware
      app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        res.status(500).json({ error: err.message });
      });

      // Act
      const response = await request(app).get('/error-sync');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Synchronous error');
    });

    it('should handle async errors', async () => {
      // Arrange
      app.get('/error-async', async (req: Request, res: Response) => {
        throw new Error('Asynchronous error');
      });

      // Error handling middleware
      app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        res.status(500).json({ error: err.message });
      });

      // Act
      const response = await request(app).get('/error-async');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Asynchronous error');
    });

    it('should handle 404 errors for undefined routes', async () => {
      // Arrange - no routes defined

      // Act
      const response = await request(app).get('/non-existent-route');

      // Assert
      expect(response.status).toBe(404);
    });
  });

  describe('Route Parameters', () => {
    it('should extract route parameters', async () => {
      // Arrange
      app.get('/users/:userId', (req: Request, res: Response) => {
        res.json({ userId: req.params.userId });
      });

      // Act
      const response = await request(app).get('/users/12345');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.userId).toBe('12345');
    });

    it('should extract multiple route parameters', async () => {
      // Arrange
      app.get('/users/:userId/tasks/:taskId', (req: Request, res: Response) => {
        res.json({
          userId: req.params.userId,
          taskId: req.params.taskId,
        });
      });

      // Act
      const response = await request(app).get('/users/123/tasks/456');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.userId).toBe('123');
      expect(response.body.taskId).toBe('456');
    });
  });

  describe('Query Parameters', () => {
    it('should parse query parameters', async () => {
      // Arrange
      app.get('/search', (req: Request, res: Response) => {
        res.json({
          query: req.query.q,
          page: req.query.page,
          limit: req.query.limit,
        });
      });

      // Act
      const response = await request(app)
        .get('/search')
        .query({ q: 'test', page: '2', limit: '10' });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.query).toBe('test');
      expect(response.body.page).toBe('2');
      expect(response.body.limit).toBe('10');
    });

    it('should handle empty query parameters', async () => {
      // Arrange
      app.get('/search', (req: Request, res: Response) => {
        const hasQuery = Object.keys(req.query).length > 0;
        res.json({ hasQuery, query: req.query });
      });

      // Act
      const response = await request(app).get('/search');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.hasQuery).toBe(false);
    });
  });

  describe('Request Headers', () => {
    it('should read request headers', async () => {
      // Arrange
      app.get('/headers', (req: Request, res: Response) => {
        res.json({
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
          'x-custom-header': req.headers['x-custom-header'],
        });
      });

      // Act
      const response = await request(app)
        .get('/headers')
        .set('X-Custom-Header', 'custom-value');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body['x-custom-header']).toBe('custom-value');
      expect(response.body['user-agent']).toBeDefined();
    });
  });

  describe('Response Headers', () => {
    it('should set response headers', async () => {
      // Arrange
      app.get('/set-headers', (req: Request, res: Response) => {
        res.set('X-Custom-Header', 'custom-value');
        res.set('X-Another-Header', 'another-value');
        res.json({ message: 'Headers set' });
      });

      // Act
      const response = await request(app).get('/set-headers');

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers['x-custom-header']).toBe('custom-value');
      expect(response.headers['x-another-header']).toBe('another-value');
    });
  });
});
