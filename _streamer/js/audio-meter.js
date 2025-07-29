/**
 * AudioMeter class for audio level monitoring
 * Handles both mono and stereo audio streams
 */
export class AudioMeter {
    constructor(audioContext, stream) {
        if (!audioContext) {
            throw new Error('AudioContext is required for AudioMeter');
        }

        if (!stream || !stream.getAudioTracks || stream.getAudioTracks().length === 0) {
            throw new Error('Valid MediaStream with audio tracks is required for AudioMeter');
        }

        this.audioContext = audioContext;
        this.stream = stream;

        console.log('Creating AudioMeter for stream with tracks:',
          stream.getTracks().map(t => ({kind: t.kind, label: t.label})));

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            throw new Error('No audio tracks found in the provided stream for AudioMeter');
        }

        const firstAudioTrack = audioTracks[0];
        const trackSettings = firstAudioTrack.getSettings();
        this.channelCount = trackSettings.channelCount || 1; // Default to 1 if undefined
        console.log(`AudioMeter: Detected channel count: ${this.channelCount}`);

        // Create source from stream
        try {
            this.source = audioContext.createMediaStreamSource(stream);
        } catch (error) {
            console.error('Error creating MediaStreamSource:', error);
            throw new Error(`Failed to create media stream source: ${error.message}`);
        }

        // Create analyzer nodes
        this.analyzerLeft = audioContext.createAnalyser();
        this.analyzerRight = null; // Initialize right analyzer as null

        // Configure left analyzer
        this.analyzerLeft.fftSize = 2048;
        this.analyzerLeft.smoothingTimeConstant = 0.2;
        this.analyzerLeft.minDecibels = -85;
        this.analyzerLeft.maxDecibels = 0;

        // Connect based on channel count
        if (this.channelCount >= 2) {
            console.log('AudioMeter: Configuring for stereo.');
            this.analyzerRight = audioContext.createAnalyser();
            // Configure right analyzer
            this.analyzerRight.fftSize = 2048;
            this.analyzerRight.smoothingTimeConstant = 0.2;
            this.analyzerRight.minDecibels = -85;
            this.analyzerRight.maxDecibels = 0;

            // Create channel splitter
            this.splitter = audioContext.createChannelSplitter(2);

            // Connect the audio graph for metering (stereo)
            try {
                this.source.connect(this.splitter);
                this.splitter.connect(this.analyzerLeft, 0, 0); // Connect source channel 0 to analyzerLeft input 0
                this.splitter.connect(this.analyzerRight, 1, 0); // Connect source channel 1 to analyzerRight input 0
            } catch (error) {
                console.error('Error connecting stereo audio nodes:', error);
                this.disconnect();
                throw new Error(`Failed to connect stereo audio nodes: ${error.message}`);
            }

            // Create data arrays for analysis
            this.dataArrayLeft = new Float32Array(this.analyzerLeft.frequencyBinCount);
            this.dataArrayRight = new Float32Array(this.analyzerRight.frequencyBinCount);

        } else {
            console.log('AudioMeter: Configuring for mono.');
            // Connect the audio graph for metering (mono)
            try {
                this.source.connect(this.analyzerLeft);
            } catch (error) {
                console.error('Error connecting mono audio node:', error);
                this.disconnect();
                throw new Error(`Failed to connect mono audio node: ${error.message}`);
            }
            // Create data array only for left analysis
            this.dataArrayLeft = new Float32Array(this.analyzerLeft.frequencyBinCount);
            this.dataArrayRight = null; // No right data array needed for mono

            // Ensure right meter UI is reset or hidden if adapting from stereo later
            const meterBarRight = document.getElementById('meter-bar-right');
            const meterValueRight = document.getElementById('meter-value-right');
            if(meterBarRight) meterBarRight.style.width = '0%';
            if(meterValueRight) meterValueRight.textContent = '-Inf dB';
        }

        console.log('AudioMeter successfully initialized');
    }

    disconnect() {
        console.log('Disconnecting AudioMeter');
        try {
            if (this.source) {
                this.source.disconnect();
                this.source = null;
            }
            if (this.splitter) {
                this.splitter.disconnect();
                this.splitter = null;
            }
            if (this.analyzerLeft) {
                this.analyzerLeft.disconnect();
                this.analyzerLeft = null;
            }
            if (this.analyzerRight) {
                this.analyzerRight.disconnect();
                this.analyzerRight = null;
            }
        } catch (error) {
            console.error('Error during AudioMeter disconnect:', error);
        }

        // Clean up reference to stream
        this.stream = null;
        this.audioContext = null;
        this.dataArrayLeft = null;
        this.dataArrayRight = null;
    }

    getLevel() {
        // Use this.channelCount to determine logic
        if (!this.analyzerLeft || (this.channelCount >= 2 && !this.analyzerRight) || !this.dataArrayLeft || (this.channelCount >= 2 && !this.dataArrayRight)) {
            // Check if analyzers/arrays exist based on expected channel count
            console.warn('AudioMeter attempting to getLevel when not properly initialized or disconnected.');
            // Return default safe values
            return {
                left: { raw: 0, db: -85 },
                right: { raw: 0, db: -85 }
            };
        }

        try {
            this.analyzerLeft.getFloatTimeDomainData(this.dataArrayLeft);
            const rmsLeft = this.calculateRMS(this.dataArrayLeft);
            const dbLeft = this.rmsToDb(rmsLeft);

            let rmsRight = 0;
            let dbRight = -85;

            if (this.channelCount >= 2 && this.analyzerRight && this.dataArrayRight) {
                this.analyzerRight.getFloatTimeDomainData(this.dataArrayRight);
                rmsRight = this.calculateRMS(this.dataArrayRight);
                dbRight = this.rmsToDb(rmsRight);
            } else if (this.channelCount < 2) {
                // For mono, mirror left channel to right for display consistency
                rmsRight = rmsLeft;
                dbRight = dbLeft;
            }

            return {
                left: {
                    raw: (dbLeft + 85) / 85,
                    db: dbLeft
                },
                right: {
                    // Use calculated right values for stereo, mirrored left for mono
                    raw: (dbRight + 85) / 85,
                    db: dbRight
                }
            };
        } catch (error) {
            console.error('Error calculating audio levels:', error);
            throw error;
        }
    }

    calculateRMS(array) {
        if (!array || array.length === 0) {
            return 0;
        }

        let sum = 0;
        for (let i = 0; i < array.length; i++) {
            sum += array[i] * array[i];
        }
        return Math.sqrt(sum / array.length);
    }

    rmsToDb(rms) {
        if (rms <= 0) return -85;  // Avoid log of zero or negative
        return Math.max(-85, Math.min(0, 20 * Math.log10(rms)));
    }
}

// Update audio meter display
export function updateAudioMeter(audioMeter) {
    if (!audioMeter) return;

    try {
        const levels = audioMeter.getLevel();

        // Update left channel
        const meterBarLeft = document.getElementById('meter-bar-left');
        const meterValueLeft = document.getElementById('meter-value-left');
        const widthLeft = Math.min(100, levels.left.raw * 100);
        meterBarLeft.style.width = `${widthLeft}%`;
        meterValueLeft.textContent = `${levels.left.db.toFixed(1)} dB`;

        // Update right channel
        const meterBarRight = document.getElementById('meter-bar-right');
        const meterValueRight = document.getElementById('meter-value-right');
        const widthRight = Math.min(100, levels.right.raw * 100);
        meterBarRight.style.width = `${widthRight}%`;
        meterValueRight.textContent = `${levels.right.db.toFixed(1)} dB`;
    } catch (error) {
        console.error('Error updating audio meter:', error);
    }
}