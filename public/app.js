// Nexus 2.0 - Goal Acceleration Platform
// Main Application JavaScript

class NexusApp {
    constructor() {
        this.apiBase = '/api';
        this.goals = [];
        this.tasks = [];
        this.currentFocusTask = null;
        this.focusTimer = null;
        this.focusTime = 25 * 60; // 25 minutes in seconds
        
        this.initializeApp();
    }

    initializeApp() {
        this.bindEvents();
        this.loadInitialData();
        this.updateLiveStats();
        
        // Start periodic updates
        setInterval(() => this.updateLiveStats(), 30000); // Every 30 seconds
    }

    bindEvents() {
        // Goal modal
        document.getElementById('addGoalBtn').addEventListener('click', () => this.showGoalModal());
        document.getElementById('cancelGoalBtn').addEventListener('click', () => this.hideGoalModal());
        document.getElementById('goalForm').addEventListener('submit', (e) => this.handleGoalSubmit(e));
        
        // Focus engine
        document.getElementById('focusBtn').addEventListener('click', () => this.getNextTask());
        
        // Quick actions
        document.getElementById('generateTasksBtn').addEventListener('click', () => this.generateTasks());
        document.getElementById('reviewProgressBtn').addEventListener('click', () => this.reviewProgress());
        document.getElementById('automateBtn').addEventListener('click', () => this.showAutomationOptions());
        
        // Close modal on outside click
        document.getElementById('goalModal').addEventListener('click', (e) => {
            if (e.target.id === 'goalModal') this.hideGoalModal();
        });
    }

    async loadInitialData() {
        try {
            await Promise.all([
                this.loadGoals(),
                this.loadProgressSummary()
            ]);
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showNotification('Failed to load data. Please refresh the page.', 'error');
        }
    }

    async loadGoals() {
        try {
            const response = await fetch(`${this.apiBase}/goals`);
            this.goals = await response.json();
            this.renderGoals();
        } catch (error) {
            console.error('Error loading goals:', error);
        }
    }

    async loadProgressSummary() {
        try {
            const response = await fetch(`${this.apiBase}/progress/summary`);
            const data = await response.json();
            this.renderProgressSummary(data);
        } catch (error) {
            console.error('Error loading progress summary:', error);
        }
    }

    renderGoals() {
        const container = document.getElementById('goalsContainer');
        if (!container) return;

        if (this.goals.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bullseye"></i>
                    <h3>No goals yet</h3>
                    <p>Add your first goal to get started!</p>
                    <button class="btn-add" id="addFirstGoalBtn">
                        <i class="fas fa-plus"></i> Add Your First Goal
                    </button>
                </div>
            `;
            document.getElementById('addFirstGoalBtn')?.addEventListener('click', () => this.showGoalModal());
            return;
        }

        container.innerHTML = this.goals.map(goal => `
            <div class="goal-card fade-in" data-goal-id="${goal.id}">
                <div class="goal-header">
                    <div>
                        <div class="goal-title">${this.escapeHtml(goal.title)}</div>
                        <div class="goal-category">${goal.category || 'Uncategorized'}</div>
                    </div>
                    <div class="goal-priority priority-${goal.priority}">
                        ${goal.priority}
                    </div>
                </div>
                
                ${goal.description ? `<p class="goal-description">${this.escapeHtml(goal.description)}</p>` : ''}
                
                <div class="goal-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${goal.progress || 0}%"></div>
                    </div>
                    <div class="progress-text">
                        <span>Progress</span>
                        <span>${goal.progress || 0}%</span>
                    </div>
                </div>
                
                ${goal.target_date ? `
                    <div class="goal-deadline">
                        <i class="far fa-calendar"></i>
                        Target: ${new Date(goal.target_date).toLocaleDateString()}
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    renderProgressSummary(data) {
        const container = document.getElementById('progressStats');
        if (!container || !data) return;

        const { summary, tasks } = data;
        
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${summary.total_goals || 0}</div>
                <div class="stat-label">Total Goals</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${summary.completed_goals || 0}</div>
                <div class="stat-label">Completed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${Math.round(summary.average_progress || 0)}%</div>
                <div class="stat-label">Avg Progress</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${summary.categories_count || 0}</div>
                <div class="stat-label">Categories</div>
            </div>
        `;
    }

    async getNextTask() {
        try {
            const response = await fetch(`${this.apiBase}/focus/next-task`);
            this.currentFocusTask = await response.json();
            
            if (this.currentFocusTask.message) {
                this.showFocusPlaceholder(this.currentFocusTask.message);
                return;
            }
            
            this.renderFocusTask(this.currentFocusTask);
            this.startFocusTimer();
            
        } catch (error) {
            console.error('Error getting next task:', error);
            this.showNotification('Failed to get next task. Please try again.', 'error');
        }
    }

    renderFocusTask(task) {
        const focusContainer = document.getElementById('focusTask');
        const detailsContainer = document.getElementById('taskDetails');
        
        if (!focusContainer || !detailsContainer) return;

        focusContainer.innerHTML = `
            <div class="focus-task-active">
                <div class="focus-task-header">
                    <h3>${this.escapeHtml(task.title)}</h3>
                    <div class="task-priority priority-${task.priority}">
                        ${task.priority}
                    </div>
                </div>
                ${task.goal_title ? `
                    <div class="focus-task-goal">
                        <i class="fas fa-bullseye"></i>
                        Part of: ${this.escapeHtml(task.goal_title)}
                    </div>
                ` : ''}
                ${task.description ? `
                    <p class="focus-task-description">${this.escapeHtml(task.description)}</p>
                ` : ''}
                ${task.estimated_time ? `
                    <div class="focus-task-time">
                        <i class="fas fa-clock"></i>
                        Estimated: ${task.estimated_time} minutes
                    </div>
                ` : ''}
                <div class="focus-task-actions">
                    <button class="btn-primary" id="startTaskBtn">
                        <i class="fas fa-play"></i> Start Working
                    </button>
                    <button class="btn-secondary" id="skipTaskBtn">
                        <i class="fas fa-forward"></i> Skip for Now
                    </button>
                </div>
            </div>
        `;

        detailsContainer.innerHTML = `
            <h4>Task Details</h4>
            <div class="task-meta">
                ${task.due_date ? `
                    <div class="task-meta-item">
                        <i class="far fa-calendar"></i>
                        Due: ${new Date(task.due_date).toLocaleDateString()}
                    </div>
                ` : ''}
                <div class="task-meta-item">
                    <i class="fas fa-flag"></i>
                    Status: ${task.status}
                </div>
                <div class="task-meta-item">
                    <i class="fas fa-calendar-plus"></i>
                    Created: ${new Date(task.created_at).toLocaleDateString()}
                </div>
            </div>
        `;

        // Bind task action events
        document.getElementById('startTaskBtn')?.addEventListener('click', () => this.startWorkingOnTask(task.id));
        document.getElementById('skipTaskBtn')?.addEventListener('click', () => this.skipTask(task.id));
    }

    showFocusPlaceholder(message) {
        const focusContainer = document.getElementById('focusTask');
        if (!focusContainer) return;

        focusContainer.innerHTML = `
            <div class="focus-placeholder">
                <i class="fas fa-check-circle"></i>
                <h3>${message}</h3>
                <p>All caught up! Add more tasks or review your goals.</p>
                <button class="btn-primary" id="addTaskFromFocusBtn">
                    <i class="fas fa-plus"></i> Add New Task
                </button>
            </div>
        `;

        document.getElementById('addTaskFromFocusBtn')?.addEventListener('click', () => {
            // TODO: Implement add task modal
            this.showNotification('Task creation coming soon!', 'info');
        });
    }

    startFocusTimer() {
        const timerElement = document.getElementById('focusTimer').querySelector('span');
        if (!timerElement) return;

        if (this.focusTimer) {
            clearInterval(this.focusTimer);
        }

        let timeLeft = this.focusTime;
        
        this.focusTimer = setInterval(() => {
            timeLeft--;
            
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            if (timeLeft <= 0) {
                clearInterval(this.focusTimer);
                this.showNotification('Focus session complete! Take a short break.', 'success');
                timerElement.textContent = '25:00';
            }
        }, 1000);
    }

    async startWorkingOnTask(taskId) {
        try {
            // TODO: Implement task start API
            this.showNotification('Starting work session...', 'info');
            
            // For now, just show a notification
            setTimeout(() => {
                this.showNotification('Great work! Task marked as in progress.', 'success');
            }, 2000);
            
        } catch (error) {
            console.error('Error starting task:', error);
            this.showNotification('Failed to start task. Please try again.', 'error');
        }
    }

    async skipTask(taskId) {
        try {
            // TODO: Implement task skip API
            this.showNotification('Task skipped. Getting next task...', 'info');
            
            // Get next task
            setTimeout(() => {
                this.getNextTask();
            }, 1000);
            
        } catch (error) {
            console.error('Error skipping task:', error);
            this.showNotification('Failed to skip task. Please try again.', 'error');
        }
    }

    showGoalModal() {
        document.getElementById('goalModal').classList.add('active');
        document.getElementById('goalTitle').focus();
        
        // Set default target date to 30 days from now
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 30);
        document.getElementById('goalTargetDate').value = defaultDate.toISOString().split('T')[0];
    }

    hideGoalModal() {
        document.getElementById('goalModal').classList.remove('active');
        document.getElementById('goalForm').reset();
    }

    async handleGoalSubmit(e) {
        e.preventDefault();
        
        const goalData = {
            title: document.getElementById('goalTitle').value.trim(),
            description: document.getElementById('goalDescription').value.trim(),
            category: document.getElementById('goalCategory').value,
            priority: document.getElementById('goalPriority').value,
            target_date: document.getElementById('goalTargetDate').value || null
        };

        if (!goalData.title) {
            this.showNotification('Goal title is required', 'error');
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/goals`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(goalData)
            });

            if (response.ok) {
                const result = await response.json();
                this.showNotification('Goal created successfully!', 'success');
                this.hideGoalModal();
                await this.loadGoals();
                await this.loadProgressSummary();
                this.updateLiveStats();
            } else {
                throw new Error('Failed to create goal');
            }
        } catch (error) {
            console.error('Error creating goal:', error);
            this.showNotification('Failed to create goal. Please try again.', 'error');
        }
    }

    async generateTasks() {
        this.showNotification('Generating smart task suggestions...', 'info');
        
        // TODO: Implement AI task generation
        setTimeout(() => {
            this.showNotification('Task generation coming soon with AI integration!', 'info');
        }, 1500);
    }

    async reviewProgress() {
        try {
            await this.loadProgressSummary();
            this.showNotification('Progress review loaded. Check your stats!', 'success');
        } catch (error) {
            console.error('Error reviewing progress:', error);
            this.showNotification('Failed to load progress review.', 'error');
        }
    }

    showAutomationOptions() {
        this.showNotification('Automation hub coming soon!', 'info');
        // TODO: Implement automation options modal
    }

    async updateLiveStats() {
        try {
            const [goalsResponse, tasksResponse] = await Promise.all([
                fetch(`${this.apiBase}/goals`),
                fetch(`${this.apiBase}/tasks`)
            ]);
            
            const goals = await goalsResponse.json();
            const tasks = await tasksResponse.json();
            
            document.getElementById('taskCount').textContent = tasks.length;
            document.getElementById('goalCount').textContent = goals.length;
            
        } catch (error) {
            console.error('Error updating live stats:', error);
        }
    }

    showNotification(message, type = 'info') {
        // Remove existing notification
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        // Add styles if not already present
        if (!document.querySelector('#notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 1rem 1.5rem;
                    border-radius: 0.5rem;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    z-index: 10000;
                    animation: slideIn 0.3s ease;
                    max-width: 400px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
                }
                .notification-success {
                    background: #10b981;
                    color: white;
                    border-left: 4px solid #059669;
                }
                .notification-error {
                    background: #ef4444;
                    color: white;
                    border-left: 4px solid #dc2626;
                }
                .notification-info {
                    background: #3b82f6;
                    color: white;
                    border-left: 4px solid #2563eb;
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.nexusApp = new NexusApp();
    
    // Add slideOut animation for notifications
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
});