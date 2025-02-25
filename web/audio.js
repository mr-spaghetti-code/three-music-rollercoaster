// Audio processing and analysis

import { state } from './config.js';
import { findClosestTimeIndex } from './utils.js';

// Audio variables
let audioElement, audioContext, audioSource, analyser;

// Initialize audio
export function setupAudio(song = 'polo') {
    return new Promise((resolve, reject) => {
        try {
            // Create audio element with the selected song
            audioElement = new Audio(`audio/${song}.mp3`);
            audioElement.crossOrigin = 'anonymous';
            
            // Create audio context
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioSource = audioContext.createMediaElementSource(audioElement);
            analyser = audioContext.createAnalyser();
            
            // Connect the audio nodes
            audioSource.connect(analyser);
            analyser.connect(audioContext.destination);
            
            // Set up the analyser
            analyser.fftSize = 256;
            
            // Add event listeners for audio
            audioElement.addEventListener('timeupdate', updatePositionFromTime);
            audioElement.addEventListener('ended', () => {
                state.isPlaying = false;
                document.getElementById('play-pause').querySelector('.control-icon').textContent = '▶️';
            });
            
            // Add event for when audio is ready
            audioElement.addEventListener('canplaythrough', () => {
                console.log(`Audio loaded and ready to play: ${song}.mp3`);
                resolve({ audioElement, audioContext, audioSource, analyser });
            });
            
            // Handle loading errors
            audioElement.addEventListener('error', (err) => {
                console.error(`Audio loading error for ${song}.mp3:`, err);
                reject(err);
            });
            
            console.log(`Audio setup initiated for ${song}.mp3`);
            
        } catch (error) {
            console.error("Error setting up audio:", error);
            reject(error);
        }
    });
}

// Toggle play/pause
export function togglePlayPause() {
    if (!audioContext || !audioElement) {
        console.error("Audio not properly initialized");
        return;
    }
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    if (state.isPlaying) {
        audioElement.pause();
        state.isPlaying = false;
        document.getElementById('play-pause').querySelector('.control-icon').textContent = '▶️';
        console.log("Audio paused");
    } else {
        audioElement.play()
            .then(() => {
                state.isPlaying = true;
                console.log("Audio playback started");
            })
            .catch(error => {
                console.error("Error playing audio:", error);
            });
        document.getElementById('play-pause').querySelector('.control-icon').textContent = '⏸️';
    }
    
    console.log(`Playback state: ${state.isPlaying ? 'Playing' : 'Paused'}`);
}

// Restart the ride from the beginning
export function restartRide() {
    if (!audioElement) {
        console.error("Audio not properly initialized");
        return;
    }
    
    audioElement.currentTime = 0;
    if (!state.isPlaying) {
        togglePlayPause();
    } else {
        // If already playing, just update the position
        updatePositionFromTime();
    }
    console.log("Ride restarted");
}

// Skip forward 10 seconds
export function skipForward() {
    if (!audioElement) {
        console.error("Audio not properly initialized");
        return;
    }
    
    // Skip forward 10 seconds, but don't exceed the duration
    audioElement.currentTime = Math.min(audioElement.currentTime + 10, audioElement.duration);
    console.log(`Skipped forward to ${audioElement.currentTime.toFixed(2)}s`);
    
    // If paused, update the position immediately
    if (!state.isPlaying) {
        updatePositionFromTime();
    }
}

// Skip backward 10 seconds
export function skipBackward() {
    if (!audioElement) {
        console.error("Audio not properly initialized");
        return;
    }
    
    // Skip backward 10 seconds, but don't go below 0
    audioElement.currentTime = Math.max(audioElement.currentTime - 10, 0);
    console.log(`Skipped backward to ${audioElement.currentTime.toFixed(2)}s`);
    
    // If paused, update the position immediately
    if (!state.isPlaying) {
        updatePositionFromTime();
    }
}

// Get audio data for visualization
export function getAudioData() {
    if (!analyser) return null;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    
    // Extract specific frequency ranges for bass, mid, and treble
    const bassSum = dataArray.slice(1, 10).reduce((a, b) => a + b, 0);
    const midSum = dataArray.slice(10, 100).reduce((a, b) => a + b, 0);
    const trebleSum = dataArray.slice(100, bufferLength).reduce((a, b) => a + b, 0);
    
    // Normalize values
    const bass = bassSum / (10 * 255);
    const mid = midSum / (90 * 255);
    const treble = trebleSum / ((bufferLength - 100) * 255);
    
    return {
        fullSpectrum: dataArray,
        bass: bass,
        mid: mid,
        treble: treble
    };
}

// Update UI and environment based on current audio time
function updatePositionFromTime() {
    if (!audioElement || !window.energyData) return;
    
    const currentTime = audioElement.currentTime;
    
    // Find the current index based on audio time
    const newIndex = findClosestTimeIndex(currentTime, window.energyData);
    
    if (newIndex !== state.currentIndex) {
        state.currentIndex = newIndex;
        
        // Check if zone has changed
        if (window.energyData[state.currentIndex]) {
            const currentEnergy = window.energyData[state.currentIndex].energy;
            let newZone;
            
            // Get zone from zone data
            if (window.zoneData && window.zoneData[state.currentIndex]) {
                const zoneValue = window.zoneData[state.currentIndex].zone;
                newZone = ['low', 'medium', 'high'][zoneValue];
            } else {
                // Fallback to energy-based zones if zone data is not available
                if (currentEnergy < 0.33) {
                    newZone = 'low';
                } else if (currentEnergy >= 0.33 && currentEnergy <= 0.66) {
                    newZone = 'medium';
                } else {
                    newZone = 'high';
                }
            }
            
            // Only update if zone has changed
            if (newZone !== state.currentZone) {
                state.currentZone = newZone;
                
                // Dispatch zone change event
                const event = new CustomEvent('zoneChange', {
                    detail: { 
                        zone: newZone,
                        energy: currentEnergy
                    }
                });
                document.dispatchEvent(event);
            }
        }
    }
}

// Get the audio element
export function getAudioElement() {
    return audioElement;
}

// Get the audio context
export function getAudioContext() {
    return audioContext;
}

// Get the analyser
export function getAnalyser() {
    return analyser;
}

// Clean up audio resources
export function cleanupAudio() {
    if (audioElement) {
        // Stop audio if playing
        if (!audioElement.paused) {
            audioElement.pause();
        }
        
        // Remove event listeners
        audioElement.removeEventListener('timeupdate', updatePositionFromTime);
        audioElement.removeEventListener('ended', () => {});
        audioElement.removeEventListener('canplaythrough', () => {});
        audioElement.removeEventListener('error', () => {});
        
        // Disconnect audio nodes
        if (audioSource) {
            audioSource.disconnect();
        }
        
        if (analyser) {
            analyser.disconnect();
        }
        
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
        }
        
        // Reset variables
        audioElement = null;
        audioContext = null;
        audioSource = null;
        analyser = null;
        
        console.log("Audio resources cleaned up");
    }
} 