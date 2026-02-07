// Authentication management
const NexusAuth = {
  // Get current auth state
  getAuth() {
    try {
      const auth = localStorage.getItem('nexus_auth');
      return auth ? JSON.parse(auth) : null;
    } catch (err) {
      console.error('Error reading auth:', err);
      return null;
    }
  },

  // Check if user is authenticated
  isAuthenticated() {
    return this.getAuth() !== null;
  },

  // Check if user is admin
  isAdmin() {
    const auth = this.getAuth();
    return auth && auth.role === 'admin';
  },

  // Get auth headers for API requests
  getAuthHeaders() {
    const auth = this.getAuth();
    return auth ? { 'Authorization': JSON.stringify(auth) } : {};
  },

  // Fetch with authentication
  async fetchWithAuth(url, options = {}) {
    const headers = {
      ...this.getAuthHeaders(),
      ...options.headers
    };

    try {
      const response = await fetch(url, { ...options, headers });
      
      // Handle auth errors
      if (response.status === 401) {
        // Clear invalid auth
        localStorage.removeItem('nexus_auth');
        // Redirect to auth page
        window.location.href = '/';
        return;
      }
      
      return response;
    } catch (error) {
      console.error('Fetch error:', error);
      throw error;
    }
  },

  // Logout
  logout() {
    localStorage.removeItem('nexus_auth');
    window.location.href = '/';
  },

  // Update UI based on auth role
  updateUI() {
    const isAdmin = this.isAdmin();
    
    // Hide/show admin-only elements
    const adminElements = document.querySelectorAll('[data-admin-only]');
    adminElements.forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });

    // Hide/show visitor-only elements
    const visitorElements = document.querySelectorAll('[data-visitor-only]');
    visitorElements.forEach(el => {
      el.style.display = !isAdmin ? '' : 'none';
    });

    // Disable action buttons for visitors
    if (!isAdmin) {
      const actionButtons = document.querySelectorAll('.btn-edit, .btn-delete, .btn-add');
      actionButtons.forEach(btn => {
        btn.disabled = true;
        btn.title = 'Admin access required';
      });
    }
  },

  // Show user role indicator
  showRoleIndicator() {
    const auth = this.getAuth();
    if (!auth) return;

    const indicator = document.createElement('div');
    indicator.id = 'role-indicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 10px 15px;
      background: ${auth.role === 'admin' ? '#667eea' : '#64748b'};
      color: white;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
    `;
    indicator.innerHTML = auth.role === 'admin' ? '🔐 Admin' : '👁️ Visitor';

    document.body.appendChild(indicator);
  },

  // Initialize
  init() {
    // Check if authenticated
    if (!this.isAuthenticated()) {
      window.location.href = '/';
      return;
    }

    // Update UI
    this.updateUI();
    this.showRoleIndicator();

    // Make fetchWithAuth available globally
    window.NexusAuth = this;
  }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  NexusAuth.init();
});
