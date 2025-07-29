// PHP-based authentication system for VoodooProducer
// Uses server-side PHP API instead of localStorage

// Configuration
const AUTH_CONFIG = {
    sessionKey: 'voodoo_producer_session',
    adminRedirectUrl: 'admin.html',
    demoRedirectUrl: 'producerhome.html',
    authApiUrl: 'auth.php',
    usersApiUrl: 'users.php'
};

// Session management
function getSessionData() {
    const session = localStorage.getItem(AUTH_CONFIG.sessionKey);
    if (!session) return null;
    
    try {
        return JSON.parse(session);
    } catch (e) {
        return null;
    }
}

function createSession(sessionToken, userType, userData) {
    const sessionData = {
        token: sessionToken,
        userType: userType,
        userData: userData,
        createdAt: Date.now()
    };
    
    localStorage.setItem(AUTH_CONFIG.sessionKey, JSON.stringify(sessionData));
}

function clearSession() {
    localStorage.removeItem(AUTH_CONFIG.sessionKey);
}

function logout() {
    clearSession();
    window.location.href = 'login.html';
}

// Check if user is authenticated
async function isAuthenticated() {
    const session = getSessionData();
    if (!session || !session.token) return false;
    
    try {
        const response = await fetch(`${AUTH_CONFIG.authApiUrl}?action=check&token=${encodeURIComponent(session.token)}`);
        return response.ok;
    } catch (e) {
        console.error('Auth check failed:', e);
        return false;
    }
}

// Client management functions for admin panel
async function loadClients() {
    const session = getSessionData();
    if (!session || !session.token) {
        throw new Error('Not authenticated');
    }
    
    try {
        const response = await fetch(`${AUTH_CONFIG.usersApiUrl}?token=${encodeURIComponent(session.token)}`);
        if (!response.ok) {
            throw new Error('Failed to load clients');
        }
        return await response.json();
    } catch (e) {
        console.error('Failed to load clients:', e);
        return {};
    }
}

async function saveClient(clientData) {
    const session = getSessionData();
    if (!session || !session.token) {
        throw new Error('Not authenticated');
    }
    
    try {
        const response = await fetch(AUTH_CONFIG.usersApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.token}`
            },
            body: JSON.stringify(clientData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save client');
        }
        
        return await response.json();
    } catch (e) {
        console.error('Failed to save client:', e);
        throw e;
    }
}

async function deleteClient(username) {
    const session = getSessionData();
    if (!session || !session.token) {
        throw new Error('Not authenticated');
    }
    
    try {
        const response = await fetch(`${AUTH_CONFIG.usersApiUrl}?username=${encodeURIComponent(username)}&token=${encodeURIComponent(session.token)}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete client');
        }
        
        return await response.json();
    } catch (e) {
        console.error('Failed to delete client:', e);
        throw e;
    }
}

// Backward compatibility functions (for old localStorage code)
function loadClientsLocal() {
    return loadClients();
}

function saveClientsLocal(clients) {
    // This is now handled by the saveClient function
    console.warn('saveClientsLocal is deprecated, use saveClient instead');
}

function saveClients(clients) {
    // This is now handled by the saveClient function
    console.warn('saveClients is deprecated, use saveClient instead');
}

// Login page logic
if (window.location.pathname.includes('login.html')) {
    // Already authenticated? Redirect to appropriate page
    isAuthenticated().then(authenticated => {
        if (authenticated) {
            const session = getSessionData();
            if (session && session.userType === 'admin') {
                window.location.href = AUTH_CONFIG.adminRedirectUrl;
            } else if (session && session.userType === 'client') {
                window.location.href = AUTH_CONFIG.demoRedirectUrl;
            }
        }
    });
    
    // Handle login form
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('username').value.trim().toLowerCase();
            const password = document.getElementById('password').value;
            const rememberMe = document.getElementById('rememberMe').checked;
            const errorMessage = document.getElementById('errorMessage');
            const loginButton = document.getElementById('loginButton');
            
            // Disable button during check
            loginButton.disabled = true;
            loginButton.textContent = 'Signing in...';
            
            try {
                const response = await fetch(AUTH_CONFIG.authApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        action: 'login',
                        username: username,
                        password: password
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    
                    // Create session
                    createSession(data.sessionToken, data.userType, data.userData);
                    
                    // Redirect based on user type
                    if (data.userType === 'admin') {
                        window.location.href = AUTH_CONFIG.adminRedirectUrl;
                    } else {
                        window.location.href = AUTH_CONFIG.demoRedirectUrl;
                    }
                } else {
                    const error = await response.json();
                    throw new Error(error.error || 'Login failed');
                }
            } catch (e) {
                console.error('Login error:', e);
                errorMessage.textContent = e.message || 'Login failed';
                errorMessage.classList.add('show');
                loginButton.disabled = false;
                loginButton.textContent = 'Sign In';
                
                // Clear error after 3 seconds
                setTimeout(() => {
                    errorMessage.classList.remove('show');
                }, 3000);
            }
        });
        
        // Focus username field on load
        document.getElementById('username').focus();
    });
}

// Protected page logic for admin pages (index.html and producer.html)
if (window.location.pathname.includes('index.html') || 
    window.location.pathname.includes('producer.html') ||
    window.location.pathname.endsWith('/voodooproducer/')) {
    
    // Check authentication
    isAuthenticated().then(authenticated => {
        if (!authenticated) {
            window.location.href = 'login.html';
        } else {
            // Check if client trying to access admin pages
            const session = getSessionData();
            if (session && session.userType === 'client') {
                window.location.href = 'producerhome.html';
            }
        }
    });
}

// demo.html has been removed - clients now use producerhome.html

// Protected page logic for admin panel
if (window.location.pathname.includes('admin.html')) {
    isAuthenticated().then(authenticated => {
        if (!authenticated) {
            window.location.href = 'login.html';
        } else {
            // Check if client trying to access admin panel
            const session = getSessionData();
            if (session && session.userType === 'client') {
                window.location.href = 'producerhome.html';
            }
        }
    });
}

// Check client expiration
async function checkClientExpiration() {
    const session = getSessionData();
    if (session && session.userType === 'client') {
        const authenticated = await isAuthenticated();
        if (!authenticated) {
            alert('Your demo access has expired. Please contact the administrator.');
            clearSession();
            window.location.href = 'login.html';
            return false;
        }
    }
    return true;
}

// Export functions for use in other scripts
window.VoodooAuth = {
    isAuthenticated,
    clearSession,
    createSession,
    checkClientExpiration
};

// Export user management functions
window.UserAPI = {
    loadClients,
    saveClient,
    deleteClient
};

// Also export getSessionData for other scripts
window.getSessionData = getSessionData;