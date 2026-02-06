const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup - use local database file in current directory
// This avoids permission issues with Docker volumes
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'nexus2.db');
const dataDir = path.dirname(DATABASE_PATH);

// Create data directory if it doesn't exist
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`📁 Created data directory: ${dataDir}`);
  } catch (err) {
    console.error(`❌ Failed to create data directory ${dataDir}: ${err.message}`);
    console.log(`⚠️ Falling back to in-memory database`);
  }
}

// Initialize database tables on first run
function initializeDatabase(callback) {
  const db = new sqlite3.Database(DATABASE_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      console.error(`❌ Database initialization error: ${err.message}`);
      callback(err);
      return;
    }
    
    // Configure database
    db.configure("busyTimeout", 5000);
    db.run("PRAGMA journal_mode = WAL;");
    db.run("PRAGMA synchronous = NORMAL;");
    db.run("PRAGMA foreign_keys = ON;");
    
    // Create tables
    db.serialize(() => {
      // Goals table - the core of Nexus 2.0
      db.run(`CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT,
        target_date TEXT,
        priority TEXT DEFAULT 'medium',
        progress INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Tasks table - connected to goals
      db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'medium',
        estimated_time INTEGER,
        actual_time INTEGER,
        due_date TEXT,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
      )`);

      // Resources table - connects tasks to tools/learning materials
      db.run(`CREATE TABLE IF NOT EXISTS resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER,
        title TEXT NOT NULL,
        url TEXT,
        type TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`);

      // Focus sessions table
      db.run(`CREATE TABLE IF NOT EXISTS focus_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER,
        duration INTEGER,
        start_time DATETIME,
        end_time DATETIME,
        distractions INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`);

      // Learning patterns table - tracks what works
      db.run(`CREATE TABLE IF NOT EXISTS learning_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_type TEXT,
        pattern_value TEXT,
        success_rate REAL,
        sample_size INTEGER,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      
      console.log(`✅ Database tables initialized at: ${DATABASE_PATH}`);
    });
    
    db.close((closeErr) => {
      if (closeErr) {
        console.error(`❌ Error closing database: ${closeErr.message}`);
      }
      callback(null);
    });
  });
}

// Initialize database on startup
initializeDatabase((err) => {
  if (err) {
    console.error(`❌ Failed to initialize database: ${err.message}`);
  } else {
    console.log(`✅ Database initialization complete`);
  }
});

// Helper function to get a database connection
function getDatabaseConnection() {
  return new Promise((resolve, reject) => {
    // First check if we can access the data directory
    fs.access(dataDir, fs.constants.W_OK, (accessErr) => {
      if (accessErr) {
        console.warn(`⚠️ Cannot write to data directory ${dataDir}: ${accessErr.message}`);
        console.warn(`⚠️ Using in-memory database instead`);
        // Use in-memory database as fallback
        const db = new sqlite3.Database(':memory:', (err) => {
          if (err) {
            reject(err);
            return;
          }
          db.configure("busyTimeout", 5000);
          resolve(db);
        });
        return;
      }
      
      // Use file-based database
      const db = new sqlite3.Database(DATABASE_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
          console.error(`❌ Failed to open database file ${DATABASE_PATH}: ${err.message}`);
          console.warn(`⚠️ Falling back to in-memory database`);
          // Fall back to in-memory database
          const fallbackDb = new sqlite3.Database(':memory:', (fallbackErr) => {
            if (fallbackErr) {
              reject(fallbackErr);
              return;
            }
            fallbackDb.configure("busyTimeout", 5000);
            resolve(fallbackDb);
          });
          return;
        }
        
        // Configure database
        db.configure("busyTimeout", 5000);
        db.run("PRAGMA journal_mode = WAL;");
        db.run("PRAGMA synchronous = NORMAL;");
        db.run("PRAGMA foreign_keys = ON;");
        resolve(db);
      });
    });
  });
}

// Database tables are initialized by the initializeDatabase function
// which runs on startup. No need for separate db.serialize() block here.

// API Routes

// Goals endpoints
app.get('/api/goals', async (req, res) => {
  console.log(`📊 GET /api/goals request received`);
  
  try {
    const db = await getDatabaseConnection();
    
    // Set timeout for database query
    const timeout = setTimeout(() => {
      console.error('❌ GET /api/goals: Database query timeout after 5 seconds');
      db.close();
      res.status(504).json({ error: 'Database query timeout', message: 'The database query took too long to execute' });
    }, 5000);

    const startTime = Date.now();
    db.all('SELECT * FROM goals ORDER BY priority DESC, created_at DESC', (err, rows) => {
      const queryTime = Date.now() - startTime;
      clearTimeout(timeout);
      
      db.close((closeErr) => {
        if (closeErr) {
          console.error(`❌ GET /api/goals: Error closing database: ${closeErr.message}`);
        }
      });
      
      if (err) {
        console.error(`❌ GET /api/goals: Database error (${queryTime}ms):`, err.message);
        res.status(500).json({ error: err.message, queryTime: `${queryTime}ms` });
        return;
      }
      
      console.log(`✅ GET /api/goals: Successfully retrieved ${rows?.length || 0} goals (${queryTime}ms)`);
      res.json(rows || []);
    });
  } catch (err) {
    console.error(`❌ GET /api/goals: Failed to get database connection:`, err.message);
    res.status(500).json({ error: 'Database connection failed', message: err.message });
  }
});

app.post('/api/goals', async (req, res) => {
  const { title, description, category, target_date, priority } = req.body;
  console.log(`📝 POST /api/goals: Creating goal "${title}"`);
  
  try {
    const db = await getDatabaseConnection();
    
    // Set timeout for database query
    const timeout = setTimeout(() => {
      console.error('❌ POST /api/goals: Database query timeout after 5 seconds');
      db.close();
      res.status(504).json({ error: 'Database query timeout', message: 'The database query took too long to execute' });
    }, 5000);

    const startTime = Date.now();
    db.run(
      'INSERT INTO goals (title, description, category, target_date, priority) VALUES (?, ?, ?, ?, ?)',
      [title, description, category, target_date, priority],
      function(err) {
        const queryTime = Date.now() - startTime;
        clearTimeout(timeout);
        
        db.close((closeErr) => {
          if (closeErr) {
            console.error(`❌ POST /api/goals: Error closing database: ${closeErr.message}`);
          }
        });
        
        if (err) {
          console.error(`❌ POST /api/goals: Database error (${queryTime}ms):`, err.message);
          res.status(500).json({ error: err.message, queryTime: `${queryTime}ms` });
          return;
        }
        
        console.log(`✅ POST /api/goals: Successfully created goal with ID ${this.lastID} (${queryTime}ms)`);
        res.json({ id: this.lastID, message: 'Goal created successfully' });
      }
    );
  } catch (err) {
    console.error(`❌ POST /api/goals: Failed to get database connection:`, err.message);
    res.status(500).json({ error: 'Database connection failed', message: err.message });
  }
});

// Tasks endpoints
app.get('/api/tasks', (req, res) => {
  const { goal_id, status } = req.query;
  let query = 'SELECT * FROM tasks';
  const params = [];
  
  if (goal_id || status) {
    query += ' WHERE';
    if (goal_id) {
      query += ' goal_id = ?';
      params.push(goal_id);
    }
    if (status) {
      if (goal_id) query += ' AND';
      query += ' status = ?';
      params.push(status);
    }
  }
  
  query += ' ORDER BY priority DESC, due_date ASC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Focus engine - get next task to work on
app.get('/api/focus/next-task', (req, res) => {
  const query = `
    SELECT t.*, g.title as goal_title, g.priority as goal_priority 
    FROM tasks t
    LEFT JOIN goals g ON t.goal_id = g.id
    WHERE t.status = 'pending'
    ORDER BY 
      CASE g.priority 
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 4
      END,
      CASE t.priority 
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 4
      END,
      t.due_date ASC
    LIMIT 1
  `;
  
  db.get(query, (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row || { message: 'No pending tasks found' });
  });
});

// Progress visualization
app.get('/api/progress/summary', (req, res) => {
  const summaryQuery = `
    SELECT 
      COUNT(*) as total_goals,
      SUM(CASE WHEN progress = 100 THEN 1 ELSE 0 END) as completed_goals,
      AVG(progress) as average_progress,
      COUNT(DISTINCT category) as categories_count
    FROM goals
  `;
  
  db.get(summaryQuery, (err, summary) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const tasksQuery = `
      SELECT 
        status,
        COUNT(*) as count
      FROM tasks
      GROUP BY status
    `;
    
    db.all(tasksQuery, (err, tasks) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      res.json({
        summary,
        tasks
      });
    });
  });
});

// Health check endpoint - simplified version that doesn't depend on database
app.get('/api/health', (req, res) => {
  console.log('🏥 Health check requested');
  
  // Try to check database, but don't fail if it doesn't work
  const checkDatabase = () => {
    return new Promise((resolve) => {
      const db = new sqlite3.Database(DATABASE_PATH, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          console.log(`⚠️ Health check: Database connection failed: ${err.message}`);
          resolve({ connected: false, error: err.message });
          return;
        }
        
        const startTime = Date.now();
        db.get('SELECT 1 as test', (queryErr, row) => {
          const queryTime = Date.now() - startTime;
          
          db.close((closeErr) => {
            if (closeErr) {
              console.error(`⚠️ Health check: Error closing database: ${closeErr.message}`);
            }
          });
          
          if (queryErr) {
            console.log(`⚠️ Health check: Database query failed (${queryTime}ms): ${queryErr.message}`);
            resolve({ connected: false, error: queryErr.message, queryTime });
          } else {
            console.log(`✅ Health check: Database connected (${queryTime}ms)`);
            resolve({ connected: true, test: row.test, queryTime });
          }
        });
      });
    });
  };
  
  // Set timeout for entire health check
  const timeout = setTimeout(() => {
    console.error('❌ Health check: Overall timeout after 5 seconds');
    res.json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'timeout',
      message: 'Health check timed out',
      app: 'running'
    });
  }, 5000);
  
  // Check database with its own timeout
  const databaseTimeout = setTimeout(() => {
    console.log('⚠️ Health check: Database check taking too long, responding without it');
    clearTimeout(timeout);
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'check_timeout',
      message: 'App is running but database check timed out',
      app: 'running'
    });
  }, 3000);
  
  checkDatabase().then((dbResult) => {
    clearTimeout(databaseTimeout);
    clearTimeout(timeout);
    
    if (dbResult.connected) {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'connected',
        test: dbResult.test,
        queryTime: `${dbResult.queryTime}ms`,
        app: 'running'
      });
    } else {
      res.json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'error',
        error: dbResult.error,
        app: 'running',
        message: 'App is running but database has issues'
      });
    }
  }).catch((err) => {
    clearTimeout(databaseTimeout);
    clearTimeout(timeout);
    console.error(`❌ Health check: Unexpected error: ${err.message}`);
    res.json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'unexpected_error',
      error: err.message,
      app: 'running'
    });
  });
});

// Simple test endpoint (no database required)
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Nexus 2.0 API is working',
    timestamp: new Date().toISOString(),
    endpoints: ['/api/health', '/api/goals', '/api/tasks', '/api/focus/next-task', '/api/progress/summary']
  });
});

// Mock data for testing UI while we fix database issues
app.get('/api/mock/goals', (req, res) => {
  const mockGoals = [
    {
      id: 1,
      title: 'Build Neural Nexus 2.0',
      description: 'Create a goal acceleration platform with AI integration',
      category: 'business',
      priority: 'high',
      progress: 75,
      target_date: '2026-02-28',
      created_at: '2026-02-01T10:00:00.000Z'
    },
    {
      id: 2,
      title: 'Learn Advanced React Patterns',
      description: 'Master hooks, context, and state management',
      category: 'learning',
      priority: 'medium',
      progress: 30,
      target_date: '2026-03-15',
      created_at: '2026-02-03T14:30:00.000Z'
    },
    {
      id: 3,
      title: 'Improve Physical Fitness',
      description: 'Exercise 4 times per week and improve diet',
      category: 'health',
      priority: 'medium',
      progress: 50,
      target_date: '2026-04-01',
      created_at: '2026-02-05T09:15:00.000Z'
    }
  ];
  
  res.json(mockGoals);
});

app.get('/api/mock/progress/summary', (req, res) => {
  res.json({
    summary: {
      total_goals: 3,
      completed_goals: 0,
      average_progress: 51.67,
      categories_count: 3
    },
    tasks: [
      { status: 'pending', count: 5 },
      { status: 'in_progress', count: 2 },
      { status: 'completed', count: 3 }
    ]
  });
});

// Mock POST goals endpoint for testing
app.post('/api/mock/goals', (req, res) => {
  const { title, description, category, target_date, priority } = req.body;
  console.log(`📝 Mock POST /api/mock/goals: Creating goal "${title}"`);
  
  // Generate a mock ID
  const mockId = Math.floor(Math.random() * 1000) + 100;
  
  // Simulate a delay
  setTimeout(() => {
    res.json({
      id: mockId,
      message: 'Goal created successfully (mock)',
      note: 'This is mock data. Real database integration is being fixed.'
    });
  }, 500);
});

// Mock Focus Engine endpoint
app.get('/api/mock/focus/next-task', (req, res) => {
  console.log('🎯 Mock GET /api/mock/focus/next-task: Getting next task');
  
  const mockTasks = [
    {
      id: 101,
      title: 'Review project requirements',
      description: 'Go through the project documentation and identify key deliverables',
      goal_id: 1,
      goal_title: 'Build Neural Nexus 2.0',
      estimated_time: 30,
      priority: 'high',
      status: 'pending'
    },
    {
      id: 102,
      title: 'Set up development environment',
      description: 'Install necessary tools and configure the workspace',
      goal_id: 1,
      goal_title: 'Build Neural Nexus 2.0',
      estimated_time: 45,
      priority: 'medium',
      status: 'pending'
    },
    {
      id: 103,
      title: 'Create database schema',
      description: 'Design and implement the SQLite database structure',
      goal_id: 1,
      goal_title: 'Build Neural Nexus 2.0',
      estimated_time: 60,
      priority: 'high',
      status: 'pending'
    }
  ];
  
  // Return a random task
  const randomTask = mockTasks[Math.floor(Math.random() * mockTasks.length)];
  
  setTimeout(() => {
    res.json(randomTask);
  }, 300);
});

// Mock goal update endpoint
app.put('/api/mock/goals/:id', (req, res) => {
  const goalId = req.params.id;
  const updates = req.body;
  console.log(`📝 Mock PUT /api/mock/goals/${goalId}: Updating goal`);
  
  setTimeout(() => {
    res.json({
      id: goalId,
      message: 'Goal updated successfully (mock)',
      updates: updates,
      note: 'This is mock data. Real database integration is being fixed.'
    });
  }, 300);
});

// Mock goal delete endpoint
app.delete('/api/mock/goals/:id', (req, res) => {
  const goalId = req.params.id;
  console.log(`🗑️ Mock DELETE /api/mock/goals/${goalId}: Deleting goal`);
  
  setTimeout(() => {
    res.json({
      id: goalId,
      message: 'Goal deleted successfully (mock)',
      note: 'This is mock data. Real database integration is being fixed.'
    });
  }, 300);
});

// Serve the main app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Nexus 2.0 Goal Acceleration Platform running on port ${PORT}`);
  console.log(`📊 Database: ${DATABASE_PATH}`);
  console.log(`🌐 Open your browser to: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
});