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

// Database setup - use a writable location with persistence
// Try multiple locations in order of preference:
// 1. Environment variable DATABASE_PATH
// 2. /app/data/nexus2.db (Docker volume if writable)
// 3. /home/node/nexus2.db (user home directory, persists in container)
// 4. In-memory fallback (last resort)

let DATABASE_PATH;
if (process.env.DATABASE_PATH) {
  DATABASE_PATH = process.env.DATABASE_PATH;
  console.log(`📊 Using DATABASE_PATH from environment: ${DATABASE_PATH}`);
} else {
  // Try locations in order of preference
  const locations = [
    { path: path.join(__dirname, 'data', 'nexus2.db'), name: 'Docker volume' },
    { path: '/home/node/nexus2.db', name: 'User home' },
    { path: '/tmp/nexus2.db', name: 'Temp directory' }
  ];
  
  let selectedLocation = null;
  
  for (const location of locations) {
    try {
      const dataDir = path.dirname(location.path);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      // Test write permission
      fs.accessSync(dataDir, fs.constants.W_OK);
      selectedLocation = location;
      break;
    } catch (err) {
      console.log(`⚠️ Cannot write to ${location.name} (${location.path}): ${err.message}`);
    }
  }
  
  if (selectedLocation) {
    DATABASE_PATH = selectedLocation.path;
    console.log(`📊 Using ${selectedLocation.name} path: ${DATABASE_PATH}`);
    if (selectedLocation.name === 'Temp directory') {
      console.log(`⚠️ Note: /tmp data may not persist between container restarts`);
    }
  } else {
    // All file-based locations failed, will use in-memory
    DATABASE_PATH = ':memory:';
    console.log(`⚠️ All file-based locations failed, using in-memory database`);
    console.log(`⚠️ WARNING: Data will be lost on app restart!`);
  }
}

const dataDir = DATABASE_PATH !== ':memory:' ? path.dirname(DATABASE_PATH) : null;

// Create data directory if it doesn't exist (for file-based databases)
if (dataDir && !fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`📁 Created data directory: ${dataDir}`);
  } catch (err) {
    console.error(`❌ Failed to create data directory ${dataDir}: ${err.message}`);
    console.log(`⚠️ Will use in-memory database if file-based fails`);
  }
}

// Test database connection on startup
getDatabaseConnection()
  .then((db) => {
    console.log(`✅ Database connection test successful`);
    db.close();
  })
  .catch((err) => {
    console.error(`❌ Database connection test failed: ${err.message}`);
  });

// Function to initialize database tables
function initializeTables(db, callback) {
  db.serialize(() => {
    // Configure database
    db.run("PRAGMA journal_mode = WAL;");
    db.run("PRAGMA synchronous = NORMAL;");
    db.run("PRAGMA foreign_keys = ON;");
    
    // Create tables
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

    db.run(`CREATE TABLE IF NOT EXISTS learning_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern_type TEXT,
      pattern_value TEXT,
      success_rate REAL,
      sample_size INTEGER,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    console.log(`✅ Database tables initialized`);
  });
  
  // Call callback after all tables are created
  db.wait(() => {
    callback(null);
  });
}

// Helper function to get a database connection with automatic table initialization
function getDatabaseConnection() {
  return new Promise((resolve, reject) => {
    // If DATABASE_PATH is already :memory:, use in-memory directly
    if (DATABASE_PATH === ':memory:') {
      console.log(`🔧 Creating in-memory database (pre-configured)`);
      const db = new sqlite3.Database(':memory:', (err) => {
        if (err) {
          console.error(`❌ Failed to create in-memory database: ${err.message}`);
          reject(err);
          return;
        }
        
        // Configure database
        db.configure("busyTimeout", 5000);
        
        // Initialize tables
        initializeTables(db, (initErr) => {
          if (initErr) {
            console.error(`❌ Failed to initialize in-memory tables: ${initErr.message}`);
            db.close();
            reject(initErr);
            return;
          }
          
          console.log(`✅ Using in-memory database`);
          resolve(db);
        });
      });
      return;
    }
    
    // Try to use file-based database
    const tryFileBased = () => {
      console.log(`🔧 Attempting to open database file: ${DATABASE_PATH}`);
      const db = new sqlite3.Database(DATABASE_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
          console.error(`❌ Failed to open database file ${DATABASE_PATH}: ${err.message}`);
          console.log(`⚠️ Falling back to in-memory database`);
          tryInMemory();
          return;
        }
        
        // Configure database
        db.configure("busyTimeout", 5000);
        
        // Initialize tables
        initializeTables(db, (initErr) => {
          if (initErr) {
            console.error(`❌ Failed to initialize tables: ${initErr.message}`);
            db.close();
            reject(initErr);
            return;
          }
          
          console.log(`✅ Using file-based database: ${DATABASE_PATH}`);
          resolve(db);
        });
      });
    };
    
    // Fallback to in-memory database
    const tryInMemory = () => {
      console.log(`🔧 Creating in-memory database (fallback)`);
      const db = new sqlite3.Database(':memory:', (err) => {
        if (err) {
          console.error(`❌ Failed to create in-memory database: ${err.message}`);
          reject(err);
          return;
        }
        
        // Configure database
        db.configure("busyTimeout", 5000);
        
        // Initialize tables
        initializeTables(db, (initErr) => {
          if (initErr) {
            console.error(`❌ Failed to initialize in-memory tables: ${initErr.message}`);
            db.close();
            reject(initErr);
            return;
          }
          
          console.log(`✅ Using in-memory database (fallback)`);
          resolve(db);
        });
      });
    };
    
    // Start with file-based database
    tryFileBased();
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

// Health check endpoint
app.get('/api/health', async (req, res) => {
  console.log('🏥 Health check requested');
  
  try {
    const db = await getDatabaseConnection();
    
    const startTime = Date.now();
    db.get('SELECT 1 as test', (err, row) => {
      const queryTime = Date.now() - startTime;
      
      db.close((closeErr) => {
        if (closeErr) {
          console.error(`⚠️ Health check: Error closing database: ${closeErr.message}`);
        }
      });
      
      if (err) {
        console.log(`⚠️ Health check: Database query failed (${queryTime}ms): ${err.message}`);
        res.json({
          status: 'degraded',
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          database: 'error',
          error: err.message,
          app: 'running',
          message: 'App is running but database has issues'
        });
      } else {
        console.log(`✅ Health check: Database connected (${queryTime}ms)`);
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          database: 'connected',
          test: row.test,
          queryTime: `${queryTime}ms`,
          app: 'running'
        });
      }
    });
  } catch (err) {
    console.error(`❌ Health check: Failed to get database connection: ${err.message}`);
    res.json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'connection_failed',
      error: err.message,
      app: 'running',
      message: 'App is running but cannot connect to database'
    });
  }
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