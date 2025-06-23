(function() {
    const style = document.createElement('style');
    style.textContent = `
        #notification-container { position: fixed; top: 1rem; right: 1rem; z-index: 2000; display: flex; flex-direction: column; align-items: flex-end; }
        .notification { padding: 10px 15px; margin-top: .5rem; border-radius: 4px; color: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.3); font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .notification.success { background: #4caf50; }
        .notification.error { background: #e53935; }
    `;
    document.head.appendChild(style);

    document.addEventListener('DOMContentLoaded', () => {
        const notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        document.body.appendChild(notificationContainer);
    });

    window.showNotification = function(message, type = 'info') {
        const container = document.getElementById('notification-container');
        if (!container) return;
        const notificationDiv = document.createElement('div');
        notificationDiv.className = 'notification ' + (type === 'error' ? 'error' : 'success');
        notificationDiv.textContent = message;
        container.appendChild(notificationDiv);
        setTimeout(() => notificationDiv.remove(), 4000);
    };
})();
