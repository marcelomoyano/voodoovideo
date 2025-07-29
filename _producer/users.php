<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// User management API for VoodooProducer Admin Panel
$users_file = 'users.json';

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

function isAdmin($sessionToken) {
    if (empty($sessionToken)) return false;
    
    $decoded = base64_decode($sessionToken);
    $parts = explode(':', $decoded);
    
    if (count($parts) !== 2) return false;
    
    $username = $parts[0];
    return $username === 'admin';
}

// Get session token from Authorization header or query param
$sessionToken = '';
$headers = getallheaders();
if (isset($headers['Authorization'])) {
    $sessionToken = str_replace('Bearer ', '', $headers['Authorization']);
} else {
    $sessionToken = $_GET['token'] ?? '';
}

// Check admin authorization for write operations
$method = $_SERVER['REQUEST_METHOD'];
if (in_array($method, ['POST', 'PUT', 'DELETE']) && !isAdmin($sessionToken)) {
    http_response_code(403);
    echo json_encode(['error' => 'Admin access required']);
    exit;
}

switch ($method) {
    case 'GET':
        handleGetUsers();
        break;
    case 'POST':
        handleCreateUser();
        break;
    case 'DELETE':
        handleDeleteUser();
        break;
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}

function handleGetUsers() {
    $users = loadUsers();
    
    // Remove admin user and passwords from response
    $response = [];
    foreach ($users as $username => $user) {
        if ($user['userType'] === 'client') {
            $clientData = [
                'username' => $user['username'],
                'expiresAt' => $user['expiresAt'] ?? null
            ];
            
            // Check if it's a multi-room user
            if (isset($user['rooms'])) {
                $clientData['rooms'] = $user['rooms'];
            } else {
                // Single room user (backward compatibility)
                $clientData['room'] = $user['room'] ?? $username;
                $clientData['maxStreamers'] = $user['maxStreamers'] ?? 3;
            }
            
            $response[$username] = $clientData;
        }
    }
    
    echo json_encode($response);
}

function handleCreateUser() {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $username = trim(strtolower($input['username'] ?? ''));
    $password = $input['password'] ?? '';
    $maxStreamers = intval($input['maxStreamers'] ?? 3);
    $expiresIn = intval($input['expiresIn'] ?? 0);
    $roomCount = intval($input['roomCount'] ?? 1); // Number of rooms to create
    
    if (empty($username) || empty($password)) {
        http_response_code(400);
        echo json_encode(['error' => 'Username and password required']);
        return;
    }
    
    if (!preg_match('/^[a-z0-9]+$/', $username)) {
        http_response_code(400);
        echo json_encode(['error' => 'Username must be lowercase letters and numbers only']);
        return;
    }
    
    $users = loadUsers();
    
    if (isset($users[$username])) {
        http_response_code(409);
        echo json_encode(['error' => 'Username already exists']);
        return;
    }
    
    // Calculate expiration (0 means permanent)
    $expiresAt = null;
    if ($expiresIn > 0) {
        $expiresAt = (time() + ($expiresIn * 24 * 60 * 60)) * 1000; // Convert to milliseconds
    }
    
    // Create rooms array
    $rooms = [];
    if ($roomCount > 1) {
        // Multi-room setup
        for ($i = 1; $i <= $roomCount; $i++) {
            if ($i === 1) {
                // First room is just the username
                $rooms[] = [
                    'name' => $username,
                    'maxStreamers' => $maxStreamers
                ];
            } else {
                // Subsequent rooms are username2, username3, etc.
                $rooms[] = [
                    'name' => $username . $i,
                    'maxStreamers' => $maxStreamers
                ];
            }
        }
    }
    
    // Add new user
    $userData = [
        'username' => $username,
        'password' => $password,
        'isDemo' => true,
        'expiresAt' => $expiresAt,
        'userType' => 'client'
    ];
    
    if ($roomCount > 1) {
        // Multi-room user
        $userData['rooms'] = $rooms;
    } else {
        // Single room user (backward compatibility)
        $userData['room'] = $username;
        $userData['maxStreamers'] = $maxStreamers;
    }
    
    $users[$username] = $userData;
    
    if (saveUsers($users)) {
        $response = [
            'success' => true,
            'message' => "Client '$username' created successfully",
            'user' => [
                'username' => $username,
                'password' => $password,
                'expiresAt' => $expiresAt
            ]
        ];
        
        if ($roomCount > 1) {
            $response['user']['rooms'] = $rooms;
        } else {
            $response['user']['room'] = $username;
            $response['user']['maxStreamers'] = $maxStreamers;
        }
        
        echo json_encode($response);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save user']);
    }
}

function handleDeleteUser() {
    $username = $_GET['username'] ?? '';
    
    if (empty($username)) {
        http_response_code(400);
        echo json_encode(['error' => 'Username required']);
        return;
    }
    
    if ($username === 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Cannot delete admin user']);
        return;
    }
    
    $users = loadUsers();
    
    if (!isset($users[$username])) {
        http_response_code(404);
        echo json_encode(['error' => 'User not found']);
        return;
    }
    
    unset($users[$username]);
    
    if (saveUsers($users)) {
        echo json_encode(['success' => true, 'message' => "User '$username' deleted"]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to delete user']);
    }
}
?>