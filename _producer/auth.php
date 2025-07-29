<?php
// Enable error logging for debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Simple authentication API for VoodooProducer
// Stores users in users.json file

$users_file = 'users.json';

// Initialize users file if it doesn't exist
if (!file_exists($users_file)) {
    $default_users = [
        'admin' => [
            'username' => 'admin',
            'password' => 'severancevoodoo2025',
            'userType' => 'admin'
        ],
        'demo' => [
            'username' => 'demo',
            'password' => 'demo123',
            'room' => 'demo',
            'isDemo' => true,
            'maxStreamers' => 3,
            'userType' => 'client'
        ]
    ];
    file_put_contents($users_file, json_encode($default_users, JSON_PRETTY_PRINT));
}

function loadUsers() {
    global $users_file;
    if (!file_exists($users_file)) {
        return [];
    }
    $content = file_get_contents($users_file);
    return json_decode($content, true) ?: [];
}

function saveUsers($users) {
    global $users_file;
    return file_put_contents($users_file, json_encode($users, JSON_PRETTY_PRINT));
}

// Handle different actions
$action = '';

// Check if it's a POST request with JSON body
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? '';
} else {
    // Fall back to GET parameters for other requests
    $action = $_GET['action'] ?? '';
}

switch ($action) {
    case 'login':
        handleLogin();
        break;
    case 'check':
        handleCheck();
        break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action', 'received_action' => $action, 'method' => $_SERVER['REQUEST_METHOD']]);
}

function handleLogin() {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = trim(strtolower($input['username'] ?? ''));
    $password = $input['password'] ?? '';
    
    if (empty($username) || empty($password)) {
        http_response_code(400);
        echo json_encode(['error' => 'Username and password required']);
        return;
    }
    
    $users = loadUsers();
    
    // Check if user exists and password matches
    if (isset($users[$username]) && $users[$username]['password'] === $password) {
        $user = $users[$username];
        
        // Check expiration for client accounts
        if ($user['userType'] === 'client' && isset($user['expiresAt'])) {
            if (time() * 1000 > $user['expiresAt']) {
                http_response_code(401);
                echo json_encode(['error' => 'Account expired']);
                return;
            }
        }
        
        // Generate session token (simple timestamp-based)
        $sessionToken = base64_encode($username . ':' . time());
        
        // Return user data
        $response = [
            'success' => true,
            'userType' => $user['userType'],
            'sessionToken' => $sessionToken,
            'userData' => $user
        ];
        
        echo json_encode($response);
    } else {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid credentials']);
    }
}

function handleCheck() {
    // Simple session validation
    $sessionToken = $_GET['token'] ?? '';
    
    if (empty($sessionToken)) {
        http_response_code(401);
        echo json_encode(['error' => 'No session token']);
        return;
    }
    
    // Decode token (simple base64 decode)
    $decoded = base64_decode($sessionToken);
    $parts = explode(':', $decoded);
    
    if (count($parts) !== 2) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid token']);
        return;
    }
    
    $username = $parts[0];
    $timestamp = intval($parts[1]);
    
    // Check if token is not too old (24 hours)
    if (time() - $timestamp > 86400) {
        http_response_code(401);
        echo json_encode(['error' => 'Session expired']);
        return;
    }
    
    $users = loadUsers();
    
    if (isset($users[$username])) {
        $user = $users[$username];
        
        // Check client account expiration
        if ($user['userType'] === 'client' && isset($user['expiresAt'])) {
            if (time() * 1000 > $user['expiresAt']) {
                http_response_code(401);
                echo json_encode(['error' => 'Account expired']);
                return;
            }
        }
        
        echo json_encode([
            'success' => true,
            'userType' => $user['userType'],
            'userData' => $user
        ]);
    } else {
        http_response_code(401);
        echo json_encode(['error' => 'User not found']);
    }
}
?>