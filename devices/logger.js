// Logger module - handles all logging functionality
export class Logger {
    constructor(containerId = 'logContainer', maxEntries = 100) {
        this.containerId = containerId;
        this.maxEntries = maxEntries;
    }

    log(message, type = 'info') {
        const logContainer = document.getElementById(this.containerId);
        if (!logContainer) return;

        const timestamp = new Date().toLocaleTimeString();
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;
        
        // Keep only the last N log entries
        while (logContainer.children.length > this.maxEntries) {
            logContainer.removeChild(logContainer.firstChild);
        }
    }

    success(message) {
        this.log(message, 'success');
    }

    error(message) {
        this.log(message, 'error');
    }

    warning(message) {
        this.log(message, 'warning');
    }

    info(message) {
        this.log(message, 'info');
    }

    clear() {
        const logContainer = document.getElementById(this.containerId);
        if (logContainer) {
            logContainer.innerHTML = '<div class="log-entry">Ready to connect...</div>';
        }
    }
}

// Export singleton instance
export const logger = new Logger();