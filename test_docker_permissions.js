const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Simulate Docker environment
const DATABASE_PATH = '/app/data/nexus2.db';
const dataDir = '/app/data';

console.log('Simulating Docker environment...');
console.log('DATABASE_PATH:', DATABASE_PATH);
console.log('dataDir:', dataDir);

// Check if we can access /app/data
try {
  fs.accessSync('/app', fs.constants.R_OK);
  console.log('✓ Can read /app');
} catch (err) {
  console.log('✗ Cannot read /app:', err.message);
}

// Try to create data directory
try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('✓ Created data directory');
  } else {
    console.log('✓ Data directory exists');
  }
  
  // Check write permissions
  fs.accessSync(dataDir, fs.constants.W_OK);
  console.log('✓ Can write to data directory');
} catch (err) {
  console.log('✗ Cannot create/write to data directory:', err.message);
}

// Try to open database
console.log('\nTrying to open database...');
const db = new sqlite3.Database(DATABASE_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('❌ Database open error:', err.message);
    console.error('❌ Error code:', err.code);
    
    // Try with different path
    console.log('\nTrying with relative path in current directory...');
    const localDb = new sqlite3.Database('./test.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err2) => {
      if (err2) {
        console.error('❌ Local database also failed:', err2.message);
      } else {
        console.log('✅ Local database works');
        localDb.close();
      }
    });
  } else {
    console.log('✅ Database opened successfully');
    
    // Try to create a table
    db.run('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY)', (err) => {
      if (err) {
        console.error('❌ Table creation failed:', err.message);
      } else {
        console.log('✅ Table created successfully');
      }
      db.close();
    });
  }
});
