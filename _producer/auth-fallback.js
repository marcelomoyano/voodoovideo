// Fallback authentication system for VoodooProducer
// Will try PHP first, fall back to localStorage if PHP fails

// Configuration
const AUTH_CONFIG = {
    sessionKey: 'voodoo_producer_session',
    adminRedirectUrl: 'admin.html',
    demoRedirectUrl: 'producerhome.html',
    authApiUrl: 'auth.php',
    usersApiUrl: 'users.php'
};

// Check if PHP backend is available
let phpBackendAvailable = null;

async function checkPhpBackend() {
    if (phpBackendAvailable !== null) {
        return phpBackendAvailable;
    }
    
    try {
        const response = await fetch('test.php');
        const data = await response.json();
        phpBackendAvailable = data.status === 'success';
    } catch (e) {
        phpBackendAvailable = false;
    }
    
    return phpBackendAvailable;
}

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

// Default users for fallback mode
const DEFAULT_USERS = {
    'admin': {
        username: 'admin',
        password: 'severancevoodoo2025',
        userType: 'admin'
    },
    'demo': {
        username: 'demo',
        password: 'demo123',
        room: 'demo',
        isDemo: true,
        maxStreamers: 3,
        userType: 'client'
    },
    'dolby': {
        username: 'dolby',
        password: 'voodoo$dolby2025',
        rooms: [
            {name: 'dolby1', maxStreamers: 5},
            {name: 'dolby2', maxStreamers: 5}
        ],
        isDemo: true,
        userType: 'client'
    },
    '11am': {
        username: '11am',
        password: 'morning$stream11',
        rooms: [
            {name: '11am1', maxStreamers: 5},
            {name: '11am2', maxStreamers: 5}
        ],
        isDemo: true,
        userType: 'client'
    },
    'bankless': {
        username: 'bankless',
        password: 'crypto$bank2025',
        rooms: [
            {name: 'bankless1', maxStreamers: 5},
            {name: 'bankless2', maxStreamers: 5}
        ],
        isDemo: true,
        userType: 'client'
    },
    'taylor': {
        username: 'taylor',
        password: 'swift$voodoo25',
        rooms: [
            {name: 'taylor1', maxStreamers: 5},
            {name: 'taylor2', maxStreamers: 5}
        ],
        isDemo: true,
        userType: 'client'
    }
};

// Get users from localStorage (fallback mode)
function getUsersLocal() {
    const users = localStorage.getItem('voodoo_users');
    if (!users) {
        // First time - initialize with DEFAULT_USERS
        localStorage.setItem('voodoo_users', JSON.stringify(DEFAULT_USERS));
        return DEFAULT_USERS;
    }
    try {
        const storedUsers = JSON.parse(users);
        // Merge stored users with DEFAULT_USERS to ensure defaults are always available
        const mergedUsers = { ...DEFAULT_USERS, ...storedUsers };
        return mergedUsers;
    } catch (e) {
        // If parsing fails, return defaults
        localStorage.setItem('voodoo_users', JSON.stringify(DEFAULT_USERS));
        return DEFAULT_USERS;
    }
}

// Save users to localStorage (fallback mode)
function saveUsersLocal(users) {
    localStorage.setItem('voodoo_users', JSON.stringify(users));
}

// Check if user is authenticated
async function isAuthenticated() {
    const session = getSessionData();
    if (!session || !session.token) return false;
    
    // Force simple session validation - ignore PHP backend
    const isExpired = Date.now() - session.createdAt > 24 * 60 * 60 * 1000; // 24 hours
    return !isExpired;
}

// Login function  
async function login(username, password) {
    // Try to read from server's users.json first
    try {
        const response = await fetch('users.json');
        if (response.ok) {
            const serverUsers = await response.json();
            const user = serverUsers[username.toLowerCase()];
            
            if (user && user.password === password) {
                // Check expiration for client accounts
                if (user.userType === 'client' && user.expiresAt && Date.now() > user.expiresAt) {
                    throw new Error('Account expired');
                }
                
                const sessionToken = btoa(username + ':' + Date.now());
                createSession(sessionToken, user.userType, user);
                const redirectUrl = user.userType === 'admin' ? AUTH_CONFIG.adminRedirectUrl : AUTH_CONFIG.demoRedirectUrl;
                return { success: true, userType: user.userType, redirectUrl: redirectUrl };
            } else {
                throw new Error('Invalid credentials');
            }
        }
    } catch (e) {
        console.log('Server users.json failed, falling back to localStorage');
    }
    
    // Fallback to localStorage if server fails
    const users = getUsersLocal();
    const user = users[username.toLowerCase()];
    
    if (user && user.password === password) {
        // Check expiration for client accounts
        if (user.userType === 'client' && user.expiresAt && Date.now() > user.expiresAt) {
            throw new Error('Account expired');
        }
        
        const sessionToken = btoa(username + ':' + Date.now());
        createSession(sessionToken, user.userType, user);
        const redirectUrl = user.userType === 'admin' ? AUTH_CONFIG.adminRedirectUrl : AUTH_CONFIG.demoRedirectUrl;
        return { success: true, userType: user.userType, redirectUrl: redirectUrl };
    } else {
        throw new Error('Invalid credentials');
    }
}

// Client management functions
async function loadClients() {
    const allClients = {};

    // Load from server's users.json first
    try {
        const response = await fetch('users.json');
        if (response.ok) {
            const serverUsers = await response.json();

            Object.keys(serverUsers).forEach(username => {
                const user = serverUsers[username];
                if (user.userType === 'client') {
                    allClients[username] = { ...user, source: 'server' };
                }
            });
        }
    } catch (e) {
        console.error('Failed to load from server:', e);
    }

    // Also load from localStorage and merge
    const localUsers = getUsersLocal();
    Object.keys(localUsers).forEach(username => {
        const user = localUsers[username];
        if (user.userType === 'client') {
            // If user exists in both, prefer server version but mark as 'both'
            if (allClients[username]) {
                allClients[username].source = 'both';
            } else {
                allClients[username] = { ...user, source: 'localStorage' };
            }
        }
    });

    return allClients;
}

async function saveClient(clientData) {
    console.log('Saving client:', clientData.username);

    // Skip PHP backend for now - go straight to localStorage
    // This ensures users are created immediately and work for login
    
    // Fallback to localStorage
    const users = getUsersLocal();
    
    // Check if username already exists
    if (users[clientData.username]) {
        throw new Error('Username already exists');
    }
    
    // Calculate expiration
    let expiresAt = null;
    if (clientData.expiresIn > 0) {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + clientData.expiresIn);
        expiresAt = expDate.getTime();
    }
    
    // Create rooms array based on roomCount
    const rooms = [];
    for (let i = 1; i <= (clientData.roomCount || 2); i++) {
        if (i === 1) {
            rooms.push({name: clientData.username, maxStreamers: clientData.maxStreamers});
        } else {
            rooms.push({name: `${clientData.username}${i}`, maxStreamers: clientData.maxStreamers});
        }
    }
    
    // Add client with proper room format
    users[clientData.username] = {
        username: clientData.username,
        password: clientData.password,
        rooms: rooms,
        isDemo: true,
        expiresAt: expiresAt,
        userType: 'client'
    };
    
    saveUsersLocal(users);
    console.log('Client saved to localStorage fallback:', clientData.username);
    return { success: true };
}

async function deleteClient(username) {
    console.log('Deleting client:', username);

    // Skip PHP backend - delete from localStorage directly
    const users = getUsersLocal();

    if (!users[username]) {
        throw new Error('Client not found in localStorage');
    }

    delete users[username];
    saveUsersLocal(users);
    console.log('Client deleted from localStorage:', username);
    return { success: true };
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
            const errorMessage = document.getElementById('errorMessage');
            const loginButton = document.getElementById('loginButton');
            
            // Disable button during check
            loginButton.disabled = true;
            loginButton.textContent = 'Signing in...';
            
            try {
                const result = await login(username, password);
                
                // Redirect based on user type
                if (result.userType === 'admin') {
                    window.location.href = AUTH_CONFIG.adminRedirectUrl;
                } else {
                    window.location.href = AUTH_CONFIG.demoRedirectUrl;
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

// Protected page logic for admin pages
if (window.location.pathname.includes('index.html') || 
    window.location.pathname.includes('producer.html') ||
    window.location.pathname.endsWith('/voodooproducer/')) {
    
    isAuthenticated().then(authenticated => {
        if (authenticated) {
            const session = getSessionData();
            if (session && session.userType === 'admin') {
                // Admin users can stay on index.html or go to admin panel
                // Let them decide via the UI
            } else if (session && session.userType === 'client') {
                // Client users should go to their producer home
                window.location.href = 'producerhome.html';
            }
        }
        // If not authenticated, index.html will show landing page
    });
}

// demo.html has been removed - clients now use producerhome.html

// Protected page logic for producer home page
if (window.location.pathname.includes('producerhome.html')) {
    isAuthenticated().then(authenticated => {
        if (!authenticated) {
            window.location.href = 'login.html';
        } else {
            const session = getSessionData();
            if (session && session.userType === 'admin') {
                window.location.href = 'index.html';
            }
        }
    });
}

// Protected page logic for admin panel
if (window.location.pathname.includes('admin.html')) {
    isAuthenticated().then(authenticated => {
        if (!authenticated) {
            window.location.href = 'login.html';
        } else {
            const session = getSessionData();
            if (session && session.userType === 'client') {
                window.location.href = 'producerhome.html';
            }
        }
    });
}

// Helper function to export localStorage users (for manual server sync)
function exportUsers() {
    const users = getUsersLocal();
    console.log('Current localStorage users:', JSON.stringify(users, null, 2));
    return users;
}

// Export functions
window.VoodooAuth = {
    isAuthenticated,
    clearSession,
    createSession,
    login
};

window.UserAPI = {
    loadClients,
    saveClient,
    deleteClient,
    exportUsers
};

window.getSessionData = getSessionData;