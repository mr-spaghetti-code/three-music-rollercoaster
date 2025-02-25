import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { colors, state, particleCount, getZoneNameFromValue, getZoneDisplayName, zoneCount } from './config.js';
import { setupAudio, getAudioData, getAudioElement, togglePlayPause, restartRide, skipForward, skipBackward, cleanupAudio } from './audio.js';
import { setupCamera, updateCameraPosition, updateControls, handleResize, getCamera, toggleViewMode } from './camera.js';
import { createRollercoaster, getRollercoasterPath, createLightOrbs, updateLightOrbs } from './rollercoaster.js';
import { createEnvironments, toggleZoneVisibility, setupLighting, createParticleSystem } from './environments.js';
import { animateObjects, togglePsychedelicEffects } from './animations.js';
import { createPsychedelicBackground, updateBackgroundUniforms, handleZoneChange, setupPostProcessing, updateBloomEffect, handlePostProcessingResize } from './effects.js';
import { updateLoadingProgress, loadData, findClosestTimeIndex } from './utils.js';

// Main scene objects
let scene, renderer, clock, composer;

// Data objects
let energyData = [], structureData = [], zoneData = [];

// Dynamic objects
let animatedObjects = [];
let particleSystem;

// Selected song
let selectedSong = null;

// Animation state
let isAnimating = false;

// Splash screen animation
let splashScene, splashCamera, splashRenderer, splashClock;
let splashParticles, splashUniforms;

// Setup event listeners
window.addEventListener('DOMContentLoaded', () => {
    setupSplashScreen();
    setupSongSelection();
    setupBackToMenuButton();
});
window.addEventListener('resize', handleWindowResize);

// Setup splash screen with Three.js effects
function setupSplashScreen() {
    // Create a simple Three.js scene for the splash screen
    splashScene = new THREE.Scene();
    splashCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    splashCamera.position.z = 30;
    
    // Create renderer
    splashRenderer = new THREE.WebGLRenderer({ alpha: true });
    splashRenderer.setSize(window.innerWidth, window.innerHeight);
    splashRenderer.setClearColor(0x000000, 0);
    
    // Add canvas to splash screen as background
    const splashScreen = document.getElementById('splash-screen');
    splashRenderer.domElement.style.position = 'absolute';
    splashRenderer.domElement.style.top = '0';
    splashRenderer.domElement.style.left = '0';
    splashRenderer.domElement.style.zIndex = '-1';
    splashScreen.appendChild(splashRenderer.domElement);
    
    // Create particle system for background effect
    const particleCount = 1000;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    const color = new THREE.Color();
    
    for (let i = 0; i < particleCount; i++) {
        // Position
        positions[i * 3] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
        
        // Color - use gradient colors from the title
        const colorChoice = Math.random();
        if (colorChoice < 0.25) {
            color.set(0x00ff99); // Green
        } else if (colorChoice < 0.5) {
            color.set(0x4fc3f7); // Blue
        } else if (colorChoice < 0.75) {
            color.set(0xff3d00); // Orange
        } else {
            color.set(0x9370db); // Purple
        }
        
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
        
        // Size
        sizes[i] = Math.random() * 2;
    }
    
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particles.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    // Shader material for particles
    const particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            pixelRatio: { value: window.devicePixelRatio }
        },
        vertexShader: `
            uniform float time;
            uniform float pixelRatio;
            attribute float size;
            varying vec3 vColor;
            
            void main() {
                vColor = color;
                
                // Oscillating movement
                vec3 pos = position;
                pos.x += sin(time * 0.2 + position.z * 0.1) * 2.0;
                pos.y += cos(time * 0.1 + position.x * 0.1) * 2.0;
                pos.z += sin(time * 0.3 + position.y * 0.1) * 2.0;
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_PointSize = size * pixelRatio * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            
            void main() {
                // Create circular particles
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                
                // Soft edge
                float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
                gl_FragColor = vec4(vColor, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        vertexColors: true
    });
    
    // Create particle system
    splashParticles = new THREE.Points(particles, particleMaterial);
    splashScene.add(splashParticles);
    
    // Store uniforms for animation
    splashUniforms = particleMaterial.uniforms;
    
    // Initialize clock
    splashClock = new THREE.Clock();
    
    // Start animation
    animateSplash();
}

// Animate splash screen
function animateSplash() {
    // Only continue if splash renderer exists
    if (!splashRenderer) return;
    
    requestAnimationFrame(animateSplash);
    
    // Update time uniform
    if (splashUniforms && splashClock) {
        splashUniforms.time.value = splashClock.getElapsedTime();
    }
    
    // Rotate particle system
    if (splashParticles) {
        splashParticles.rotation.x += 0.0005;
        splashParticles.rotation.y += 0.001;
    }
    
    // Render scene
    if (splashScene && splashCamera) {
        splashRenderer.render(splashScene, splashCamera);
    }
}

// Clean up splash screen resources
function cleanupSplashScreen() {
    if (splashRenderer) {
        // We'll keep the canvas in the DOM for the loading screen
        // but we'll dispose of the Three.js resources
        
        // Dispose of the renderer but don't remove the canvas
        splashRenderer.dispose();
        
        // Clear references
        splashScene = null;
        splashCamera = null;
        splashRenderer = null;
        splashClock = null;
        splashParticles = null;
        splashUniforms = null;
        
        console.log("Splash screen resources cleaned up, canvas preserved for background");
    }
}

// Setup song selection
function setupSongSelection() {
    console.log("Setting up song selection");
    
    // The song selection is now handled in the HTML script
    // We just need to make sure the init function is available globally
    window.init = init;
}

// Initialize the application
async function init() {
    console.log(`Initializing SoundScape Voyager for song: ${window.selectedSong}`);
    
    // Store selected song in our variable
    selectedSong = window.selectedSong;
    
    updateLoadingProgress(0, "Initializing...");
    
    // Setup Three.js scene, renderer and camera
    setupScene();
    
    // Make scene available globally for animations
    window.scene = scene;
    
    // Load audio and data files
    await Promise.all([
        setupAudioWithProgress(),
        loadDataWithProgress()
    ]);
    
    // Create the rollercoaster and environments
    const { environmentObjects, allObjects } = createEnvironmentElements();
    
    // Hide loading screen and setup control event listeners
    finishLoading();
    
    // Set animation state to true
    isAnimating = true;
    
    // Start animation loop
    animate();
}

// Setup scene, renderer and camera
function setupScene() {
    updateLoadingProgress(10, "Setting up scene...");
    
    // Create scene
    scene = new THREE.Scene();
    // Use the default zone's ambient color for the initial fog
    const defaultZone = 'low';
    const defaultZoneKey = defaultZone + 'Zone';
    scene.fog = new THREE.FogExp2(colors[defaultZoneKey].fogColor, 0.01);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    
    // Create canvas container if it doesn't exist
    let container = document.getElementById('canvas-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'canvas-container';
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.zIndex = '0';
        document.body.appendChild(container);
    }
    container.appendChild(renderer.domElement);
    
    // Setup camera - pass renderer as parameter
    const camera = setupCamera(scene, renderer);
    
    // Setup post-processing effects
    composer = setupPostProcessing(renderer, scene, camera.camera);
    
    // Initialize clock
    clock = new THREE.Clock();
    
    console.log("Scene setup complete");
}

// Load audio with progress tracking
async function setupAudioWithProgress() {
    updateLoadingProgress(20, "Loading audio...");
    try {
        await setupAudio(selectedSong);
        updateLoadingProgress(40, "Audio loaded!");
    } catch (error) {
        console.error("Error loading audio:", error);
        updateLoadingProgress(40, "Audio load error, using fallback");
    }
}

// Load data files with progress tracking
async function loadDataWithProgress() {
    // Determine the data directory based on the selected song
    const dataDir = `data/${selectedSong}/`;
    
    // Load energy data
    updateLoadingProgress(45, "Loading energy data...");
    energyData = await new Promise(resolve => {
        loadData(`${dataDir}energy_values_energy.csv`, 'energy', (type, data) => {
            console.log(`Received ${data.length} energy data points for ${selectedSong}`);
            resolve(data);
        });
    });
    
    // Load structure data
    updateLoadingProgress(55, "Loading structure data...");
    structureData = await new Promise(resolve => {
        loadData(`${dataDir}energy_values_structure.csv`, 'structure', (type, data) => {
            console.log(`Received ${data.length} structure data points for ${selectedSong}`);
            resolve(data);
        });
    });

    // Load zone data
    updateLoadingProgress(65, "Loading zone data...");
    zoneData = await new Promise(resolve => {
        loadData(`${dataDir}energy_values_zones.csv`, 'zones', (type, data) => {
            console.log(`Received ${data.length} zone data points for ${selectedSong}`);
            // Log some zone values to verify
            if (data.length > 0) {
                console.log(`Zone data examples for ${selectedSong}:`);
                console.log("First zone:", data[0]);
                console.log("Middle zone:", data[Math.floor(data.length/2)]);
                console.log("Last zone:", data[data.length-1]);
                
                // Count unique zone values
                const uniqueZones = new Set();
                data.forEach(item => uniqueZones.add(item.zone));
                console.log("Unique zone values:", Array.from(uniqueZones).sort());
            }
            resolve(data);
        });
    });
    
    // Make data available globally
    window.energyData = energyData;
    window.structureData = structureData;
    window.zoneData = zoneData;
    
    // Log some samples to verify data
    if (energyData.length > 0) {
        console.log(`Energy data sample for ${selectedSong}:`, energyData[0], energyData[Math.floor(energyData.length/2)]);
    }
    
    updateLoadingProgress(70, "Data loaded!");
    console.log(`Loaded ${energyData.length} energy data points, ${structureData.length} structure data points, and ${zoneData.length} zone data points for ${selectedSong}`);
}

// Create rollercoaster, environments, and visual elements
function createEnvironmentElements() {
    updateLoadingProgress(60, "Creating environment...");
    
    // Create psychedelic background
    createPsychedelicBackground(scene);
    
    // Create environments with proper loading sequencing
    const { environmentObjects, animatedObjects: envAnimatedObjects, allObjects } = createEnvironments(scene);
    
    // Add environment animated objects to our main animatedObjects array
    if (envAnimatedObjects && envAnimatedObjects.length > 0) {
        animatedObjects = animatedObjects.concat(envAnimatedObjects);
        console.log(`Added ${envAnimatedObjects.length} environment objects to animation list`);
    }
    
    // Create rollercoaster from energy data after environment is created
    const rollercoaster = createRollercoaster(scene, energyData, energyData);
    
    // Setup lighting
    setupLighting(scene);
    
    // Create light orbs that follow the rollercoaster path (reduced count for performance)
    createLightOrbs(scene, 15);
    
    // Create particle system
    particleSystem = createParticleSystem(scene, particleCount);
    animatedObjects.push(particleSystem);
    
    // Register event handler for zone changes
    document.addEventListener('zonechange', (event) => handleZoneChange(event, scene));
    
    updateLoadingProgress(90, "Environment created!");
    
    return { environmentObjects, allObjects };
}

// Finish loading and setup controls
function finishLoading() {
    updateLoadingProgress(100, "Ready!");
    
    // Hide loading screen with a fade effect
    setTimeout(() => {
        document.getElementById('loading').style.opacity = "0";
        setTimeout(() => {
            // Move the particle canvas to the main scene if it exists
            const particleCanvas = document.querySelector('#loading canvas');
            if (particleCanvas) {
                particleCanvas.style.zIndex = '-1';
                document.body.appendChild(particleCanvas);
            }
            
            document.getElementById('loading').style.display = "none";
            
            // Show back to menu button
            document.getElementById('back-to-menu').style.display = "flex";
            
            // Clean up splash screen resources
            cleanupSplashScreen();
            
            // Auto-play when everything is loaded
            console.log("Auto-starting playback");
            togglePlayPause();
        }, 500);
    }, 500);
    
    // Setup control button event listeners
    document.getElementById('play-pause').addEventListener('click', togglePlayPause);
    document.getElementById('restart').addEventListener('click', restartRide);
    document.getElementById('skip-forward').addEventListener('click', skipForward);
    document.getElementById('skip-backward').addEventListener('click', skipBackward);
    document.getElementById('toggle-view').addEventListener('click', () => toggleViewMode(getRollercoasterPath(), getAudioElement()));
    document.getElementById('toggle-effects').addEventListener('click', togglePsychedelicEffects);
    
    // Setup keyboard controls
    window.addEventListener('keydown', handleKeyDown);
    
    console.log("Loading complete, controls initialized");
}

// Handle window resize
function handleWindowResize() {
    // Resize main renderer if it exists
    if (renderer) {
        renderer.setSize(window.innerWidth, window.innerHeight);
        handleResize();
        handlePostProcessingResize(renderer, window.innerWidth, window.innerHeight);
    }
    
    // Resize splash screen renderer if it exists
    if (splashRenderer && splashCamera) {
        splashRenderer.setSize(window.innerWidth, window.innerHeight);
        splashCamera.aspect = window.innerWidth / window.innerHeight;
        splashCamera.updateProjectionMatrix();
    }
}

// Keyboard controls
function handleKeyDown(event) {
    switch(event.key) {
        case ' ': // Space bar
            togglePlayPause();
            break;
        case 'r': // Restart
            restartRide();
            break;
        case 'ArrowRight': // Skip forward
            skipForward();
            break;
        case 'ArrowLeft': // Skip backward
            skipBackward();
            break;
        case 'v': // Toggle view mode
            toggleViewMode(getRollercoasterPath(), getAudioElement());
            break;
        case 'p': // Toggle psychedelic effects
            togglePsychedelicEffects();
            break;
        case 'Escape': // Go back to menu
            document.getElementById('back-to-menu').click();
            break;
    }
}

// Update UI indicators with real-time information
function updateUIIndicators(currentTime, energyData, currentIndex) {
    // Format time as MM:SS
    const minutes = Math.floor(currentTime / 60);
    const seconds = Math.floor(currentTime % 60).toString().padStart(2, '0');
    
    // Update time display
    const currentTimeEl = document.getElementById('current-time');
    if (currentTimeEl) {
        currentTimeEl.textContent = `${minutes}:${seconds}`;
    }
    
    // Update energy level display
    if (energyData[currentIndex]) {
        const currentEnergy = energyData[currentIndex].energy;
        const currentEnergyEl = document.getElementById('current-energy');
        if (currentEnergyEl) {
            currentEnergyEl.textContent = currentEnergy.toFixed(2);
        }
        
        // Get zone from zone data
        let newZone;
        if (window.zoneData && window.zoneData[currentIndex]) {
            // Get the zone value from the zone data
            const zoneValue = window.zoneData[currentIndex].zone;
            
            // Ensure zoneValue is a valid number
            if (typeof zoneValue === 'number' && !isNaN(zoneValue)) {
                // Use the helper function to get zone name from value
                newZone = getZoneNameFromValue(zoneValue);
                
                // Log zone changes for debugging (only occasionally to avoid console spam)
                if (Math.random() < 0.01) {
                    console.log(`Current zone value: ${zoneValue}, mapped to zone name: ${newZone}`);
                }
            } else {
                console.warn(`Invalid zone value at index ${currentIndex}:`, zoneValue);
                // Fallback to energy-based zone
                const zoneSize = 1.0 / zoneCount;
                const zoneIndex = Math.min(Math.floor(currentEnergy / zoneSize), zoneCount - 1);
                newZone = getZoneNameFromValue(zoneIndex);
            }
        } else {
            // Fallback to energy-based zones if zone data is not available
            // Divide the energy range (0-1) by the number of zones
            const zoneSize = 1.0 / zoneCount;
            // Calculate zone index based on energy level
            const zoneIndex = Math.min(Math.floor(currentEnergy / zoneSize), zoneCount - 1);
            newZone = getZoneNameFromValue(zoneIndex);
        }
        
        // Update zone display
        const currentZoneEl = document.getElementById('current-zone');
        if (currentZoneEl) {
            // Get the display name for the current zone
            const displayName = colors[newZone + 'Zone']?.displayName || newZone;
            currentZoneEl.textContent = displayName;
        }
        
        // Only dispatch zone change event if zone has changed
        if (newZone !== state.currentZone) {
            state.currentZone = newZone;
            
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

// Animation loop
function animate() {
    // Stop animation if we're not animating anymore
    if (!isAnimating) return;
    
    requestAnimationFrame(animate);
    
    // Get delta time
    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();
    
    // Get audio element
    const audioElement = getAudioElement();
    
    if (audioElement) {
        // Update current time and index even when paused
        const currentTime = audioElement.currentTime;
        state.currentIndex = findClosestTimeIndex(currentTime, energyData);
        
        // Update UI indicators in real-time
        updateUIIndicators(currentTime, energyData, state.currentIndex);
        
        // Get current audio data
        const audioData = getAudioData();
        
        // Update scene fog color based on current zone
        if (scene && scene.fog && state.currentZone) {
            // Get fog color from the zone palette
            const zoneKey = state.currentZone + 'Zone';
            if (colors[zoneKey] && colors[zoneKey].fogColor) {
                const fogColor = new THREE.Color(colors[zoneKey].fogColor);
                // Smoothly transition the fog color
                scene.fog.color.lerp(fogColor, 0.05);
            }
        }
        
        // Update psychedelic background if present (always, regardless of playback state)
        if (audioData) {
            updateBackgroundUniforms(
                elapsedTime,
                audioData.bass * 2.0,
                audioData.mid * 2.0,
                audioData.treble * 2.0,
                colors[state.currentZone + 'Zone'].main
            );
            
            // Update bloom effect based on audio intensity
            updateBloomEffect(
                audioData.bass,
                audioData.mid,
                audioData.treble
            );
            
            // Update light orbs along the rollercoaster
            updateLightOrbs(audioData);
        }
        
        // Always update camera position along path based on current time
        // This allows scrubbing through the visualization even when paused
        updateCameraPosition(getRollercoasterPath(), audioElement, energyData);
        
        // Always animate objects based on audio data, even when paused
        // This makes the visualization fully interactive at any point
        if (animatedObjects.length > 0 && audioData) {
            animateObjects(delta, audioData.fullSpectrum, animatedObjects, energyData);
        }
    }
    
    // Update controls
    updateControls(delta);
    
    // Render scene with post-processing
    if (composer) {
        composer.render();
    } else if (renderer && scene) {
        renderer.render(scene, getCamera());
    }
}

// Handle back to menu button
function setupBackToMenuButton() {
    const backButton = document.getElementById('back-to-menu');
    if (backButton) {
        backButton.addEventListener('click', () => {
            console.log("Back to song selection menu clicked");
            
            // Hide back button
            backButton.style.display = 'none';
            
            // Show song selection menu with proper opacity and display settings
            const loadingScreen = document.getElementById('loading');
            loadingScreen.style.display = 'flex';
            loadingScreen.style.opacity = '1';
            document.getElementById('song-selection').style.display = 'block';
            document.getElementById('loading-text').textContent = 'Select a song to begin...';
            document.getElementById('progress-bar').style.width = '0%';
            
            // Reset CD selections and stop any spinning animations
            document.querySelectorAll('.cd-container').forEach(container => {
                container.classList.remove('selected');
                
                // Reset any spinning CDs
                const cd = container.querySelector('.cd');
                if (cd) {
                    cd.classList.remove('spinning');
                    // Ensure any inline transform styles are removed
                    cd.style.transform = '';
                }
                
                // Reset preview buttons
                const previewButton = container.querySelector('.preview-button');
                if (previewButton) {
                    previewButton.textContent = 'Preview';
                    previewButton.classList.remove('playing');
                }
                
                // Stop any playing audio previews
                const songName = container.getAttribute('data-song');
                if (songName) {
                    const audio = new Audio(`./audio/${songName}/preview.mp3`);
                    audio.pause();
                    audio.currentTime = 0;
                }
            });
            
            // Hide start button
            document.getElementById('start-button').style.display = 'none';
            document.getElementById('start-button').disabled = true;
            
            // Clean up resources
            cleanupResources();
            
            // Reset state
            selectedSong = null;
            window.selectedSong = null;
            
            // Keep the splash particles animation running
            // We don't need to recreate it since we're reusing the canvas
        });
    }
}

// Clean up resources when going back to menu
function cleanupResources() {
    // Stop animation loop
    isAnimating = false;
    
    // Clean up audio resources
    cleanupAudio();
    
    // Clear arrays
    energyData = [];
    structureData = [];
    zoneData = [];
    animatedObjects = [];
    
    // Dispose of Three.js objects if they exist
    if (scene) {
        // Remove all objects from the scene
        while(scene.children.length > 0) { 
            const object = scene.children[0];
            scene.remove(object);
            
            // Properly dispose of geometries and materials
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        }
        
        // Clear the scene
        scene = null;
    }
    
    // Dispose of renderer if it exists
    if (renderer) {
        // Remove the canvas from the DOM
        const container = document.getElementById('canvas-container');
        if (container && container.firstChild) {
            container.removeChild(container.firstChild);
        }
        
        renderer.dispose();
        renderer = null;
    }
    
    // Dispose of composer if it exists
    if (composer) {
        composer.passes.forEach(pass => {
            if (pass.dispose) pass.dispose();
        });
        composer = null;
    }
    
    // Reset clock
    clock = null;
    
    // Reset particle system
    particleSystem = null;
    
    console.log("Resources cleaned up");
}

// Make functions available globally for debugging
window.mainFunctions = {
    togglePlayPause,
    restartRide,
    skipForward,
    skipBackward,
    toggleViewMode: () => toggleViewMode(getRollercoasterPath(), getAudioElement()),
    togglePsychedelicEffects
};