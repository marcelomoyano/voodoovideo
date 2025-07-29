# Producer Panel Integration for Mac Recorder Control

This guide shows how to add Mac recorder control to your producer panel.

## 1. Detecting Mac Recorders

Mac recorders identify themselves with `type: "recorder"` when registering:

```javascript
// In your stream-registered handler
ablyChannel.subscribe('stream-registered', (msg) => {
    const data = msg.data;
    
    // Check if it's a Mac recorder
    if (data.type === 'recorder') {
        console.log(`Mac recorder connected: ${data.streamId}`);
        // Add to your streams with recorder indicator
        addStream({
            ...data,
            isRecorder: true,
            streamName: data.streamName || `${data.streamId}'s Mac Recorder`
        });
    }
});
```

## 2. Starting/Stopping Recording

The commands are the same as regular streams, but Mac recorders respond to both:

```javascript
// Start recording
function startMacRecording(streamId) {
    console.log(`Starting Mac recording for ${streamId}`);
    ablyChannel.publish('producer-command', {
        command: 'START_RECORDING',  // or 'START_STREAM' - both work
        streamId: streamId
    });
}

// Stop recording
function stopMacRecording(streamId) {
    console.log(`Stopping Mac recording for ${streamId}`);
    ablyChannel.publish('producer-command', {
        command: 'STOP_RECORDING',  // or 'STOP_STREAM' - both work
        streamId: streamId
    });
}
```

## 3. Getting Recording Progress

Mac recorders send upload progress updates:

```javascript
// Listen for recording progress
ablyChannel.subscribe('recording-progress', (msg) => {
    const data = msg.data;
    if (data.type === 'hls-upload-progress') {
        console.log(`Upload progress for ${data.streamId}:`);
        console.log(`- Completed: ${data.completedUploads}/${data.totalSegments}`);
        console.log(`- Progress: ${Math.round(data.progress * 100)}%`);
        
        // Update your UI
        updateRecordingProgress(data.streamId, data.progress);
    }
});
```

## 4. Getting the Playback URL

The HLS stream URL follows this pattern:

```javascript
function getRecordingUrl(room, participantId) {
    // Base R2 URL (replace with your actual R2 domain)
    const r2Domain = 'https://your-r2-domain.r2.cloudflarestorage.com';
    const bucket = 'vod';  // or your bucket name
    
    // HLS playlist URL
    const playlistUrl = `${r2Domain}/${bucket}/${room}/${participantId}/playlist.m3u8`;
    
    return playlistUrl;
}

// Example usage
const streamUrl = getRecordingUrl('testroom', 'recorder1');
// Returns: https://your-r2-domain.r2.cloudflarestorage.com/vod/testroom/recorder1/playlist.m3u8
```

## 5. Adding Recording Controls to Stream Cards

Update your stream card rendering to show recording controls:

```javascript
function createStreamCard(stream, streamId) {
    const safeId = sanitizeId(streamId);
    const isRecorder = stream.type === 'recorder' || stream.isRecorder;
    
    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML = `
        <div class="video-header">
            <div class="video-title">
                ${stream.streamName || streamId}
                ${isRecorder ? '<span class="recorder-badge">📹 Mac Recorder</span>' : ''}
            </div>
            <div class="video-status ${stream.status}">${stream.status.toUpperCase()}</div>
        </div>
        
        <div class="video-controls">
            ${isRecorder ? `
                <button class="control-btn record-start" onclick="startMacRecording('${streamId}')">
                    <i data-lucide="circle"></i>
                    Start Recording
                </button>
                <button class="control-btn record-stop" onclick="stopMacRecording('${streamId}')">
                    <i data-lucide="square"></i>
                    Stop Recording
                </button>
                <button class="control-btn view-recording" onclick="viewRecording('${stream.room}', '${streamId}')">
                    <i data-lucide="play"></i>
                    View Recording
                </button>
            ` : `
                <!-- Regular stream controls -->
            `}
        </div>
        
        ${isRecorder && stream.status === 'recording' ? `
            <div class="recording-progress">
                <div class="progress-bar">
                    <div class="progress-fill" id="progress-${safeId}" style="width: 0%"></div>
                </div>
                <span class="progress-text" id="progress-text-${safeId}">Uploading...</span>
            </div>
        ` : ''}
    `;
    return card;
}
```

## 6. Viewing/Sharing Recordings

Add functions to view or copy recording links:

```javascript
function viewRecording(room, participantId) {
    const url = getRecordingUrl(room, participantId);
    
    // Open in new window with HLS player
    const playerUrl = `/player.html?url=${encodeURIComponent(url)}`;
    window.open(playerUrl, '_blank');
}

function copyRecordingLink(room, participantId) {
    const url = getRecordingUrl(room, participantId);
    
    navigator.clipboard.writeText(url).then(() => {
        console.log('Recording URL copied:', url);
        // Show toast/notification
        showNotification('Recording URL copied to clipboard');
    });
}

function downloadRecording(room, participantId) {
    // Generate download link for the full recording
    const url = getRecordingUrl(room, participantId);
    
    // Create m3u8 downloader or provide direct segment links
    const downloadInfo = {
        playlist: url,
        segments: `${url.replace('playlist.m3u8', '')}segment*.ts`
    };
    
    console.log('Download info:', downloadInfo);
    // Implement your download logic
}
```

## 7. Handling Recorder-Specific Events

```javascript
// Update your status handler for recorders
function handleStreamStatus(data) {
    const stream = streams.get(data.streamId);
    if (!stream) return;
    
    // Update status
    stream.status = data.status;
    updateStreamStatus(data.streamId, data.status);
    
    // Handle recorder-specific statuses
    if (stream.type === 'recorder') {
        switch(data.status) {
            case 'recording':
                console.log(`Mac recorder ${data.streamId} started recording`);
                // Show recording indicator
                showRecordingIndicator(data.streamId);
                break;
                
            case 'stopped':
                console.log(`Mac recorder ${data.streamId} stopped recording`);
                // Show "View Recording" button
                enableViewRecordingButton(data.streamId);
                break;
        }
    }
}
```

## 8. Complete Integration Example

```javascript
// Add to your producerhome.js

// Mac Recorder specific functions
function isMacRecorder(stream) {
    return stream.type === 'recorder' || stream.platform === 'macOS';
}

function handleMacRecorderJoined(streamData) {
    console.log('Mac recorder joined:', streamData);
    
    // Add recorder-specific UI elements
    const enrichedData = {
        ...streamData,
        isRecorder: true,
        capabilities: ['record', 'upload-hls'],
        recordingUrl: getRecordingUrl(streamData.room, streamData.streamId)
    };
    
    addStream(enrichedData);
}

// Update recording progress
function updateRecordingProgress(streamId, progress) {
    const safeId = sanitizeId(streamId);
    const progressBar = document.getElementById(`progress-${safeId}`);
    const progressText = document.getElementById(`progress-text-${safeId}`);
    
    if (progressBar) {
        progressBar.style.width = `${Math.round(progress * 100)}%`;
    }
    if (progressText) {
        progressText.textContent = progress >= 1 ? 'Upload Complete' : `Uploading ${Math.round(progress * 100)}%`;
    }
}

// Add these to your global functions
window.startMacRecording = startMacRecording;
window.stopMacRecording = stopMacRecording;
window.viewRecording = viewRecording;
window.copyRecordingLink = copyRecordingLink;
```

## 9. CSS for Recorder Indicators

```css
/* Add to your producer panel CSS */
.recorder-badge {
    background: #4CAF50;
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    margin-left: 8px;
}

.recording-progress {
    padding: 10px;
    background: rgba(0,0,0,0.1);
    border-radius: 4px;
    margin-top: 10px;
}

.progress-bar {
    height: 4px;
    background: rgba(255,255,255,0.2);
    border-radius: 2px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: #4CAF50;
    transition: width 0.3s ease;
}

.progress-text {
    font-size: 12px;
    color: #888;
    display: block;
    margin-top: 5px;
}

.control-btn.record-start {
    background: #f44336;
}

.control-btn.record-stop {
    background: #666;
}

.control-btn.view-recording {
    background: #2196F3;
}
```

## 10. Testing the Integration

```javascript
// Test commands in browser console
const testRecorder = {
    streamId: 'test-recorder-1',
    streamName: "Test Mac Recorder",
    status: 'ready',
    room: 'testroom',
    type: 'recorder',
    platform: 'macOS'
};

// Simulate recorder joining
addStream(testRecorder);

// Test start recording
startMacRecording('test-recorder-1');

// Test progress update
updateRecordingProgress('test-recorder-1', 0.45);

// Get recording URL
console.log(getRecordingUrl('testroom', 'test-recorder-1'));
```

## Notes

- Mac recorders use the same Ably channels but identify with `type: "recorder"`
- Recording URLs are predictable: `room/participantId/playlist.m3u8`
- Progress updates come via `recording-progress` events
- Recordings start uploading immediately (no post-processing delay)
- HLS format allows playback while still recording