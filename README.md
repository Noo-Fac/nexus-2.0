# Nexus 2.0 - Goal Acceleration Platform

🚀 **Not just a task manager, but an active partner in achieving your goals.**

## What is Nexus 2.0?

Nexus 2.0 is a completely new approach to productivity. Instead of just tracking tasks, it actively pushes you toward your goals through intelligent task generation, focus optimization, and resource connection.

## Core Philosophy: Goal-First Architecture

1. **Start with Goals** - Define what you want to achieve
2. **Connect Everything** - Every task ties directly to a goal
3. **Accelerate Progress** - The system suggests optimal next steps
4. **Learn & Adapt** - Gets smarter about what works for you

## Key Features

### 🎯 Goal-First Design
- Define goals with categories, priorities, and target dates
- Visual progress tracking for each goal
- Automatic priority calculation based on goal importance

### 🧠 Intelligent Task Generation
- AI suggests next-step tasks based on goals
- Estimates time requirements
- Connects tasks to relevant resources

### 🔍 Focus Engine
- Tells you what to work on RIGHT NOW
- Pomodoro-style focus timer
- Distraction tracking and minimization

### 🔗 Resource Network
- Connect tasks to tools, tutorials, and templates
- Suggests learning materials for skill gaps
- Shows who could help with specific tasks

### 📊 Progress Visualization
- Not just task completion, but goal proximity
- Predictive completion dates
- Productivity pattern analysis

### ⚡ Automation Hub
- Built-in automation for repetitive tasks
- One-click delegation suggestions
- Workflow optimization recommendations

## Technical Architecture

### Backend
- **Node.js** with Express
- **SQLite** database (lightweight, file-based)
- RESTful API design
- Modular architecture for easy extension

### Frontend
- Vanilla JavaScript (no framework dependencies)
- Modern CSS with CSS Grid/Flexbox
- Responsive design
- Dark mode optimized for focus

### Database Schema
- `goals` - Core goals with progress tracking
- `tasks` - Tasks connected to goals
- `resources` - Tools, tutorials, templates
- `focus_sessions` - Work session tracking
- `learning_patterns` - Productivity pattern analysis

## Getting Started

### Prerequisites
- Node.js 16+
- npm or yarn

### Installation
```bash
cd nexus-2.0
npm install
```

### Running Locally
```bash
npm start
# or for development with auto-restart
npm run dev
```

The app will be available at `http://localhost:3001`

### Database
The SQLite database is automatically created at `./data/nexus2.db` on first run.

## API Endpoints

### Goals
- `GET /api/goals` - List all goals
- `POST /api/goals` - Create new goal

### Tasks
- `GET /api/tasks` - List tasks (filter by goal_id, status)
- `POST /api/tasks` - Create new task

### Focus Engine
- `GET /api/focus/next-task` - Get next task to work on

### Progress
- `GET /api/progress/summary` - Get progress overview

## Deployment

### Local Development
```bash
npm install
npm start
# Access at http://localhost:3001
```

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up -d

# Or with Docker directly
docker build -t nexus-2-0 .
docker run -p 3001:3001 -v $(pwd)/data:/app/data nexus-2-0
```

### Coolify Deployment
1. Connect GitHub repository: `Noo-Fac/nexus-2.0`
2. Use `docker-compose.yml` for deployment
3. Port: 3001
4. Access at: https://nexus-2-0.noospherefactotum.com

### Environment Variables
Copy `.env.example` to `.env` and configure:
- `PORT` - Server port (default: 3001)
- `DATABASE_PATH` - SQLite database path
- `SESSION_SECRET` - Secret for sessions
- `NODE_ENV` - Environment (development/production)

## Development Roadmap

### Phase 1: Core MVP ✅
- [x] Goal management
- [x] Basic task system
- [x] Focus engine
- [x] Progress tracking
- [x] Responsive UI

### Phase 2: Intelligence
- [ ] AI task generation
- [ ] Pattern learning
- [ ] Resource recommendations
- [ ] Automation suggestions

### Phase 3: Advanced Features
- [ ] Mobile app
- [ ] Team collaboration
- [ ] Advanced analytics
- [ ] Integration ecosystem

## Design Principles

1. **Speed** - Fast loading, instant interactions
2. **Clarity** - Clean interface, no clutter
3. **Guidance** - Always know what to do next
4. **Adaptation** - Learns from your work patterns
5. **Connection** - Links tasks to resources and people

## Why Nexus 2.0 is Different

| Traditional Task Managers | Nexus 2.0 |
|--------------------------|-----------|
| Track what you're doing | Drives what you should do |
| Passive recording | Active acceleration |
| Isolated tasks | Goal-connected system |
| Manual prioritization | Intelligent suggestions |
| Simple completion | Progress visualization |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

Built with ❤️ by Noosphere Factotum for Gene Nunez

---

**Remember:** The goal isn't to complete tasks. The goal is to achieve goals. Nexus 2.0 helps you do exactly that.