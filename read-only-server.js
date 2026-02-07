const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.READ_ONLY_PORT || 3002;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Block all write operations with clear message
app.use(['/api/goals', '/api/tasks', '/api/focus', '/api/progress'], (req, res, next) => {
  if (req.method !== 'GET') {
    return res.status(403).json({
      error: 'Read-Only Mode',
      message: 'This is a read-only viewer. Contact the administrator to make changes.',
      hint: 'Access the full version at https://nexus.noospherefactotum.com'
    });
  }
  next();
});

// Import the database setup from main server
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'nexus2.db');

function getDatabaseConnection() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DATABASE_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(db);
    });
  });
}

// Read-only goals endpoint
app.get('/api/goals', async (req, res) => {
  try {
    const db = await getDatabaseConnection();
    
    db.all('SELECT * FROM goals ORDER BY priority DESC, created_at DESC', (err, rows) => {
      db.close();
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows || []);
    });
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Read-only tasks endpoint
app.get('/api/tasks', async (req, res) => {
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
  
  try {
    const db = await getDatabaseConnection();
    
    db.all(query, params, (err, rows) => {
      db.close();
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows || []);
    });
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Read-only focus endpoint
app.get('/api/focus/next-task', async (req, res) => {
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
  
  try {
    const db = await getDatabaseConnection();
    
    db.get(query, (err, row) => {
      db.close();
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(row || { message: 'No pending tasks found' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Read-only progress endpoint
app.get('/api/progress/summary', async (req, res) => {
  const summaryQuery = `
    SELECT 
      COUNT(*) as total_goals,
      SUM(CASE WHEN progress = 100 THEN 1 ELSE 0 END) as completed_goals,
      AVG(progress) as average_progress,
      COUNT(DISTINCT category) as categories_count
    FROM goals
  `;
  
  try {
    const db = await getDatabaseConnection();
    
    db.get(summaryQuery, (err, summary) => {
      if (err) {
        db.close();
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
        db.close();
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
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const db = await getDatabaseConnection();
    
    db.get('SELECT 1 as test', (err, row) => {
      db.close();
      
      if (err) {
        res.json({
          status: 'degraded',
          mode: 'read-only',
          database: 'error',
          error: err.message
        });
      } else {
        res.json({
          status: 'healthy',
          mode: 'read-only',
          database: 'connected',
          app: 'running'
        });
      }
    });
  } catch (err) {
    res.json({
      status: 'degraded',
      mode: 'read-only',
      database: 'connection_failed',
      error: err.message
    });
  }
});

// Serve the main app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🔒 Nexus 2.0 Read-Only Viewer running on port ${PORT}`);
  console.log(`📊 Database: ${DATABASE_PATH} (READ-ONLY)`);
  console.log(`🌐 Viewer URL: http://localhost:${PORT}`);
  console.log(`⚠️  All write operations are blocked`);
});
