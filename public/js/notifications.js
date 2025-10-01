// Toast Notification System
(function() {
  // Create toast container if it doesn't exist
  function getToastContainer() {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  // Show toast notification
  function showToast(message, type = 'info', duration = 4000) {
    const container = getToastContainer();

    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-message">${message}</div>
      <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);

    // Auto remove after duration
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    }, duration);

    // Remove on click
    toast.addEventListener('click', (e) => {
      if (!e.target.classList.contains('toast-close')) {
        toast.remove();
      }
    });
  }

  // Export to window
  window.showToast = showToast;
  window.notify = {
    success: (msg) => showToast(msg, 'success'),
    error: (msg) => showToast(msg, 'error'),
    warning: (msg) => showToast(msg, 'warning'),
    info: (msg) => showToast(msg, 'info')
  };
})();
