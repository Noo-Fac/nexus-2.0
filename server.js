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

// Database setup - ensure data directory exists
const DATABASE_PATH = process.env.DATABASE_PATH || '/app/data/nexus2.db';
const dataDir = path.dirname(DATABASE_PATH);

// Create data directory if it doesn't exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`📁 Created data directory: ${dataDir}`);
}

// Create database with better error handling and timeout
const db = new sqlite3.Database(DATABASE_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error(`❌ Database connection error: ${err.message}`);
    console.error(`❌ Database path: ${DATABASE_PATH}`);
    console.error(`❌ Error code: ${err.code}`);
  } else {
    console.log(`✅ Connected to SQLite database at: ${DATABASE_PATH}`);
    
    // Configure database for better performance
    db.configure("busyTimeout", 5000); // 5 second timeout for locked database
    db.run("PRAGMA journal_mode = WAL;"); // Write-Ahead Logging for better concurrency
    db.run("PRAGMA synchronous = NORMAL;"); // Balance between safety and performance
    db.run("PRAGMA foreign_keys = ON;"); // Enable foreign key constraints
    
    console.log(`✅ Database configured with WAL mode and 5s timeout`);
  }
});

// Handle database errors
db.on('error', (err) => {
  console.error(`❌ Database error event: ${err.message}`);
});

// Initialize database tables
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
});

// API Routes

// Goals endpoints
app.get('/api/goals', (req, res) => {
  console.log(`📊 GET /api/goals request received`);
  
  // Set timeout for database query
  const timeout = setTimeout(() => {
    console.error('❌ GET /api/goals: Database query timeout after 5 seconds');
    res.status(504).json({ error: 'Database query timeout', message: 'The database query took too long to execute' });
  }, 5000); // 5 second timeout

  const startTime = Date.now();
  db.all('SELECT * FROM goals ORDER BY priority DESC, created_at DESC', (err, rows) => {
    const queryTime = Date.now() - startTime;
    clearTimeout(timeout);
    
    if (err) {
      console.error(`❌ GET /api/goals: Database error (${queryTime}ms):`, err.message);
      res.status(500).json({ error: err.message, queryTime: `${queryTime}ms` });
      return;
    }
    
    console.log(`✅ GET /api/goals: Successfully retrieved ${rows?.length || 0} goals (${queryTime}ms)`);
    res.json(rows || []);
  });
});

app.post('/api/goals', (req, res) => {
  const { title, description, category, target_date, priority } = req.body;
  console.log(`📝 POST /api/goals: Creating goal "${title}"`);
  
  // Set timeout for database query
  const timeout = setTimeout(() => {
    console.error('❌ POST /api/goals: Database query timeout after 5 seconds');
    res.status(504).json({ error: 'Database query timeout', message: 'The database query took too long to execute' });
  }, 5000); // 5 second timeout

  const startTime = Date.now();
  db.run(
    'INSERT INTO goals (title, description, category, target_date, priority) VALUES (?, ?, ?, ?, ?)',
    [title, description, category, target_date, priority],
    function(err) {
      const queryTime = Date.now() - startTime;
      clearTimeout(timeout);
      
      if (err) {
        console.error(`❌ POST /api/goals: Database error (${queryTime}ms):`, err.message);
        res.status(500).json({ error: err.message, queryTime: `${queryTime}ms` });
        return;
      }
      
      console.log(`✅ POST /api/goals: Successfully created goal with ID ${this.lastID} (${queryTime}ms)`);
      res.json({ id: this.lastID, message: 'Goal created successfully' });
    }
  );
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
app.get('/api/health', (req, res) => {
  // Test database connection
  db.get('SELECT 1 as test', (err, row) => {
    if (err) {
      res.json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'error',
        error: err.message
      });
      return;
    }
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'connected',
      test: row.test
    });
  });
});

// Simple test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Nexus 2.0 API is working',
    timestamp: new Date().toISOString(),
    endpoints: ['/api/health', '/api/goals', '/api/tasks', '/api/focus/next-task']
  });
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