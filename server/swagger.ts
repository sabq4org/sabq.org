import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Sabq News Platform API',
    version: '1.0.0',
    description: 'منصة سبق الإخبارية الذكية - واجهة برمجة التطبيقات',
    contact: {
      name: 'Sabq Support',
      email: 'info@sabq.org',
    },
    license: {
      name: 'Proprietary',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'API Server',
    },
  ],
  components: {
    securitySchemes: {
      sessionAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'connect.sid',
        description: 'Session-based authentication using cookies',
      },
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT Bearer token authentication',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'User ID' },
          username: { type: 'string', description: 'Username' },
          email: { type: 'string', format: 'email', description: 'Email address' },
          displayName: { type: 'string', description: 'Display name' },
          role: { type: 'string', description: 'User role' },
          avatar: { type: 'string', description: 'Avatar URL' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Article: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Article ID' },
          title: { type: 'string', description: 'Article title' },
          slug: { type: 'string', description: 'URL-friendly slug' },
          content: { type: 'string', description: 'Article content (HTML)' },
          excerpt: { type: 'string', description: 'Short excerpt' },
          featuredImage: { type: 'string', description: 'Featured image URL' },
          status: { 
            type: 'string', 
            enum: ['draft', 'pending', 'published', 'archived'],
            description: 'Article status' 
          },
          authorId: { type: 'string', description: 'Author user ID' },
          categoryId: { type: 'string', description: 'Category ID' },
          viewCount: { type: 'integer', description: 'View count' },
          publishedAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Category: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Category ID' },
          name: { type: 'string', description: 'Category name' },
          nameEn: { type: 'string', description: 'Category name in English' },
          slug: { type: 'string', description: 'URL-friendly slug' },
          description: { type: 'string', description: 'Category description' },
          icon: { type: 'string', description: 'Icon name' },
          color: { type: 'string', description: 'Theme color' },
          isActive: { type: 'boolean', description: 'Active status' },
          sortOrder: { type: 'integer', description: 'Sort order' },
        },
      },
      Comment: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Comment ID' },
          content: { type: 'string', description: 'Comment content' },
          articleId: { type: 'string', description: 'Article ID' },
          userId: { type: 'string', description: 'User ID' },
          parentId: { type: 'string', nullable: true, description: 'Parent comment ID for replies' },
          status: { 
            type: 'string', 
            enum: ['pending', 'approved', 'rejected'],
            description: 'Comment status' 
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', description: 'Username or email' },
          password: { type: 'string', format: 'password', description: 'Password' },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string', description: 'Username' },
          email: { type: 'string', format: 'email', description: 'Email address' },
          password: { type: 'string', format: 'password', description: 'Password' },
          displayName: { type: 'string', description: 'Display name' },
        },
      },
      AIInsight: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['trend', 'summary', 'recommendation'] },
          title: { type: 'string' },
          content: { type: 'string' },
          confidence: { type: 'number', format: 'float' },
          generatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Error message' },
          code: { type: 'string', description: 'Error code' },
        },
      },
      PaginatedResponse: {
        type: 'object',
        properties: {
          data: { type: 'array', items: {} },
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          hasMore: { type: 'boolean' },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Unauthorized - Authentication required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      Forbidden: {
        description: 'Forbidden - Insufficient permissions',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
    },
  },
  tags: [
    { name: 'Authentication', description: 'المصادقة - Authentication endpoints' },
    { name: 'Articles', description: 'المقالات - Article management' },
    { name: 'Categories', description: 'التصنيفات - Category management' },
    { name: 'Users', description: 'المستخدمين - User management' },
    { name: 'Comments', description: 'التعليقات - Comment management' },
    { name: 'Reactions', description: 'التفاعلات - Reactions and engagement' },
    { name: 'AI Features', description: 'ميزات الذكاء الاصطناعي - AI-powered features' },
    { name: 'Analytics', description: 'التحليلات - Analytics and insights' },
    { name: 'Notifications', description: 'الإشعارات - Notification management' },
    { name: 'Media', description: 'الوسائط - Media and file management' },
    { name: 'Admin', description: 'الإدارة - Administrative operations' },
  ],
  paths: {
    '/auth/user': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current user',
        description: 'Returns the currently authenticated user information',
        security: [{ sessionAuth: [] }, { bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user information',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login',
        description: 'Authenticate user and create session',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          '401': {
            description: 'Invalid credentials',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register',
        description: 'Create a new user account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Registration successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          '400': {
            description: 'Validation error or user already exists',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Logout',
        description: 'End the current session',
        security: [{ sessionAuth: [] }, { bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Logout successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/articles': {
      get: {
        tags: ['Articles'],
        summary: 'Get articles list',
        description: 'Retrieve a paginated list of articles with optional filters',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page' },
          { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Filter by category ID' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'pending', 'published', 'archived'] }, description: 'Filter by status' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search in title and content' },
          { name: 'authorId', in: 'query', schema: { type: 'string' }, description: 'Filter by author ID' },
        ],
        responses: {
          '200': {
            description: 'List of articles',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PaginatedResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Article' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Articles'],
        summary: 'Create article',
        description: 'Create a new article',
        security: [{ sessionAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'content', 'categoryId'],
                properties: {
                  title: { type: 'string' },
                  content: { type: 'string' },
                  excerpt: { type: 'string' },
                  featuredImage: { type: 'string' },
                  categoryId: { type: 'string' },
                  status: { type: 'string', enum: ['draft', 'pending', 'published'] },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Article created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Article' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/articles/{id}': {
      get: {
        tags: ['Articles'],
        summary: 'Get single article',
        description: 'Retrieve a single article by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Article ID' },
        ],
        responses: {
          '200': {
            description: 'Article details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Article' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      put: {
        tags: ['Articles'],
        summary: 'Update article',
        description: 'Update an existing article',
        security: [{ sessionAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Article ID' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  content: { type: 'string' },
                  excerpt: { type: 'string' },
                  featuredImage: { type: 'string' },
                  categoryId: { type: 'string' },
                  status: { type: 'string', enum: ['draft', 'pending', 'published', 'archived'] },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Article updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Article' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Articles'],
        summary: 'Delete article',
        description: 'Delete an article',
        security: [{ sessionAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Article ID' },
        ],
        responses: {
          '200': {
            description: 'Article deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/categories': {
      get: {
        tags: ['Categories'],
        summary: 'Get categories',
        description: 'Retrieve all categories',
        parameters: [
          { name: 'active', in: 'query', schema: { type: 'boolean' }, description: 'Filter by active status' },
        ],
        responses: {
          '200': {
            description: 'List of categories',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Category' },
                },
              },
            },
          },
        },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'Get users',
        description: 'Retrieve a list of users (admin only)',
        security: [{ sessionAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'role', in: 'query', schema: { type: 'string' }, description: 'Filter by role' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by username or email' },
        ],
        responses: {
          '200': {
            description: 'List of users',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PaginatedResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/User' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/comments': {
      get: {
        tags: ['Comments'],
        summary: 'Get comments',
        description: 'Retrieve comments for an article',
        parameters: [
          { name: 'articleId', in: 'query', required: true, schema: { type: 'string' }, description: 'Article ID' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          '200': {
            description: 'List of comments',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Comment' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Comments'],
        summary: 'Create comment',
        description: 'Add a new comment to an article',
        security: [{ sessionAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['articleId', 'content'],
                properties: {
                  articleId: { type: 'string' },
                  content: { type: 'string' },
                  parentId: { type: 'string', description: 'Parent comment ID for replies' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Comment created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Comment' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/homepage': {
      get: {
        tags: ['Articles'],
        summary: 'Get homepage data',
        description: 'Retrieve homepage content including featured articles and sections',
        responses: {
          '200': {
            description: 'Homepage data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    featured: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Article' },
                    },
                    breaking: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Article' },
                    },
                    categories: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          category: { $ref: '#/components/schemas/Category' },
                          articles: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Article' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/ai/insights/today': {
      get: {
        tags: ['AI Features'],
        summary: 'Get AI insights',
        description: 'Retrieve AI-generated insights for today',
        security: [{ sessionAuth: [] }, { bearerAuth: [] }],
        responses: {
          '200': {
            description: 'AI insights',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    insights: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/AIInsight' },
                    },
                    generatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/reactions': {
      post: {
        tags: ['Reactions'],
        summary: 'Add reaction',
        description: 'Add a reaction to an article',
        security: [{ sessionAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['articleId', 'type'],
                properties: {
                  articleId: { type: 'string' },
                  type: { type: 'string', enum: ['like', 'love', 'wow', 'sad', 'angry'] },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Reaction added',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string' },
                    articleId: { type: 'string' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Get notifications',
        description: 'Retrieve user notifications',
        security: [{ sessionAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'unreadOnly', in: 'query', schema: { type: 'boolean' }, description: 'Filter unread only' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          '200': {
            description: 'List of notifications',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      type: { type: 'string' },
                      title: { type: 'string' },
                      message: { type: 'string' },
                      read: { type: 'boolean' },
                      createdAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/media/upload': {
      post: {
        tags: ['Media'],
        summary: 'Upload media',
        description: 'Upload a media file',
        security: [{ sessionAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                  folder: { type: 'string', description: 'Target folder' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Upload successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    url: { type: 'string' },
                    filename: { type: 'string' },
                    mimeType: { type: 'string' },
                    size: { type: 'integer' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/admin/dashboard/stats': {
      get: {
        tags: ['Admin'],
        summary: 'Get dashboard stats',
        description: 'Retrieve admin dashboard statistics',
        security: [{ sessionAuth: [] }, { bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Dashboard statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    totalArticles: { type: 'integer' },
                    totalUsers: { type: 'integer' },
                    totalComments: { type: 'integer' },
                    totalViews: { type: 'integer' },
                    recentActivity: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/analytics/overview': {
      get: {
        tags: ['Analytics'],
        summary: 'Get analytics overview',
        description: 'Retrieve analytics overview data',
        security: [{ sessionAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          '200': {
            description: 'Analytics overview',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    pageViews: { type: 'integer' },
                    uniqueVisitors: { type: 'integer' },
                    avgTimeOnSite: { type: 'number' },
                    bounceRate: { type: 'number' },
                    topArticles: { type: 'array', items: { $ref: '#/components/schemas/Article' } },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
  },
};

export function setupSwagger(app: Express): void {
  app.get('/api-docs/json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerSpec);
  });

  // Swagger UI setup with specific CSP for its own assets
  // Using swaggerUi.serve which serves static assets, plus setup for the UI
  app.use('/api-docs', 
    swaggerUi.serve, 
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Sabq News Platform API Documentation',
      customCssUrl: undefined, // Use bundled CSS
      customJs: undefined, // Use bundled JS
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        docExpansion: 'none', // Start collapsed for better performance
        defaultModelsExpandDepth: -1, // Hide models by default
      },
    })
  );

  console.log('[Swagger] ✅ API documentation available at /api-docs');
}
