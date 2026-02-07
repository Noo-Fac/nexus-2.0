# Nexus 2.0 Read-Only Viewer Setup

## Quick Start

1. **Deploy the read-only version on a different port:**

```bash
cd /root/.openclaw/workspace/apps/nexus-2.0
READ_ONLY_PORT=3002 node read-only-server.js
```

2. **Access the read-only viewer:**
- Your full version: `https://nexus.noospherefactotum.com` (read/write)
- Friend's view-only: `https://nexus-readonly.noospherefactotum.com` (read-only)

## What Your Friend Can Do:
✅ View all goals and tasks
✅ Browse the interface
✅ See progress visualizations
✅ Click around and explore

## What Your Friend Cannot Do:
❌ Create new goals
❌ Edit existing goals
❌ Delete anything
❌ Modify tasks

## Coolify Deployment (Recommended)

### Add to Coolify as New App:

1. In Coolify, create a new app
2. Use the same GitHub repo
3. Set command to: `node read-only-server.js`
4. Set environment variable: `READ_ONLY_PORT=3002`
5. Deploy with a different subdomain: `nexus-readonly.noospherefactotum.com`

### Docker Compose Setup:

```yaml
services:
  nexus-readonly:
    build: .
    ports:
      - "3002:3002"
    environment:
      - READ_ONLY_PORT=3002
      - DATABASE_PATH=/app/data/nexus2.db
    volumes:
      - ./data:/app/data:ro  # Read-only mount
    restart: unless-stopped
```

## Alternative: Simple URL Parameter

Want an even simpler solution? Add this to your main `server.js`:

```javascript
// Add at the top after middleware
app.use((req, res, next) => {
  if (req.query.mode === 'readonly') {
    if (req.method !== 'GET' && req.path.startsWith('/api/')) {
      return res.status(403).json({
        error: 'Read-Only Mode',
        message: 'Viewing only. Contact admin to make changes.'
      });
    }
  }
  next();
});
```

Then share: `https://nexus.noospherefactotum.com?mode=readonly`

## Security Note

The read-only version connects to the **same database** as the main version. Your friend can see everything, but cannot modify it through the API.
