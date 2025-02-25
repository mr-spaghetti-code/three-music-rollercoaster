import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { colors, state, particleCount, getZoneNameFromValue, getZoneDisplayName, zoneCount, config } from './config.js';
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
let isIntroAnimationActive = false;

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
            
            // Start intro animation instead of immediately auto-playing
            console.log("Starting intro animation");
            startIntroAnimation();
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

// Early in the file, add a function to create the fade overlay
function createFadeOverlay() {
    // Create the fade overlay element if it doesn't exist
    let fadeOverlay = document.getElementById('fade-overlay');
    if (!fadeOverlay) {
        fadeOverlay = document.createElement('div');
        fadeOverlay.id = 'fade-overlay';
        fadeOverlay.style.position = 'fixed';
        fadeOverlay.style.top = '0';
        fadeOverlay.style.left = '0';
        fadeOverlay.style.width = '100%';
        fadeOverlay.style.height = '100%';
        fadeOverlay.style.backgroundColor = 'white';
        fadeOverlay.style.opacity = '0';
        fadeOverlay.style.pointerEvents = 'none'; // Don't block user interaction
        fadeOverlay.style.zIndex = '2500'; // Increased to be above everything
        fadeOverlay.style.transition = 'opacity 2.5s cubic-bezier(0.4, 0.0, 0.2, 1)'; // Much slower transition (changed from 0.5s to 2.5s)
        fadeOverlay.style.boxShadow = 'inset 0 0 100px rgba(255,255,255,0.9)'; // Add glow effect
        document.body.appendChild(fadeOverlay);
        console.log("Fade overlay created");
    }
    return fadeOverlay;
}

// Make the fade effect more dramatic and reliable with improved transitions
function fadeToWhite(duration = 300) {
    console.log("Fading to white");
    const fadeOverlay = createFadeOverlay();
    
    // Remove transition temporarily for instant flash
    fadeOverlay.style.transition = 'none';
    
    // Force DOM reflow so the transition removal takes effect
    fadeOverlay.offsetHeight;
    
    // Make it fully visible
    fadeOverlay.style.opacity = '1';
    
    // Force another reflow to ensure the opacity change applies immediately
    fadeOverlay.offsetHeight;
    
    // Add transition back for smooth fade out later
    fadeOverlay.style.transition = 'opacity 0.5s cubic-bezier(0.4, 0.0, 0.2, 1)';
    
    // Also add the CSS animation as a backup
    document.body.classList.add('flash-white');
    setTimeout(() => {
        document.body.classList.remove('flash-white');
    }, duration + 200); // Longer than our transition
    
    return new Promise(resolve => setTimeout(resolve, duration));
}

function fadeFromWhite(duration = 1500) { // Increased from 400ms to 1500ms
    console.log("Fading from white");
    const fadeOverlay = createFadeOverlay();
    
    // Ensure the overlay is visible before fading
    if (parseFloat(fadeOverlay.style.opacity) < 0.9) {
        // If it's not fully visible, make it visible first
        fadeOverlay.style.transition = 'none';
        fadeOverlay.style.opacity = '1';
        fadeOverlay.offsetHeight; // Force reflow
    }
    
    // Add a slight delay to ensure the white is visible
    setTimeout(() => {
        fadeOverlay.style.transition = 'opacity 3.5s cubic-bezier(0.4, 0.0, 0.2, 1)'; // Much slower fade out (changed from 0.8s to 3.5s)
        fadeOverlay.style.opacity = '0';
    }, 100); // Increased delay from 50ms to 100ms
    
    return new Promise(resolve => setTimeout(resolve, duration + 500)); // Added more time for the transition (from 100ms to 500ms extra)
}

// Intro animation - camera flies in from top of sphere to the track
function startIntroAnimation() {
    console.log("Starting intro animation...");
    
    // Set intro animation active state
    isIntroAnimationActive = true;
    
    // Get the camera and rollercoaster path
    const camera = getCamera();
    let path = getRollercoasterPath();
    
    // Check if we have valid camera and path
    if (!camera) {
        console.error("Camera not found, cannot start intro animation");
        return;
    }
    
    if (!path) {
        console.error("Rollercoaster path not found, creating a fallback path");
        // Create a simple fallback path - a circle
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, -50),
            new THREE.Vector3(50, 0, 0),
            new THREE.Vector3(0, 0, 50),
            new THREE.Vector3(-50, 0, 0),
            new THREE.Vector3(0, 0, -50)
        ]);
        curve.closed = true;
        path = curve;
    }
    
    console.log("Camera and path found, setting up animation");
    
    // Temporarily disable first person controls during intro animation
    const originalFirstPersonMode = state.firstPersonMode;
    state.firstPersonMode = false;
    
    // Set initial camera position much farther away for a better overview of the scene
    camera.position.set(0, 2000, 2000); // Dramatically increased distance from (0, 800, 800) to (0, 2000, 2000)
    camera.lookAt(0, 0, 0);
    
    // Add a slight initial rotation for more dynamic feel
    camera.rotation.z = THREE.MathUtils.degToRad(5); // Reduced rotation for better initial view
    
    // Get the starting point on the rollercoaster
    let startPoint;
    try {
        startPoint = path.getPointAt(0);
        console.log("Start point on path:", startPoint);
    } catch (error) {
        console.error("Error getting start point:", error);
        startPoint = new THREE.Vector3(0, 0, 0);
    }
    
    // Store original fog density and increase it for dramatic effect
    let originalFogDensity = 0.01;
    if (scene.fog && scene.fog.density) {
        originalFogDensity = scene.fog.density;
        scene.fog.density = 0.005; // Reduced fog density for better initial view
    }
    
    // Create a timeline for the intro animation
    const duration = 8.0; // Increased to 8 seconds for a more gradual transition
    const startTime = clock.getElapsedTime();
    console.log("Animation start time:", startTime);
    
    // Create a flag to track if animation is complete
    let introAnimationComplete = false;
    
    // Hide UI elements during intro animation
    document.getElementById('info').style.opacity = '0';
    document.getElementById('controls').style.opacity = '0';
    document.getElementById('view-controls').style.opacity = '0';
    document.getElementById('back-to-menu').style.opacity = '0';
    
    // Prepare audio for immediate playback
    const audioElement = getAudioElement();
    if (audioElement) {
        // Start audio immediately at full volume
        audioElement.currentTime = 0;
        audioElement.volume = 1.0;
        
        // Start playing immediately
        audioElement.play().catch(e => {
            console.warn("Could not auto-play audio:", e);
            // Try again with user interaction
            document.addEventListener('click', function playOnClick() {
                audioElement.play();
                document.removeEventListener('click', playOnClick);
            }, { once: true });
        });
        
        // Update play/pause button to show pause icon
        const playPauseButton = document.getElementById('play-pause');
        if (playPauseButton) {
            playPauseButton.querySelector('.control-icon').textContent = '⏸️';
        }
        
        // Update state to playing
        state.isPlaying = true;
    } else {
        console.warn("Audio element not found for intro animation");
    }
    
    // Create fade overlay early so it's available for the entire experience
    createFadeOverlay();
    
    // Create an animation function
    function animateIntro() {
        if (introAnimationComplete) return;
        
        const currentTime = clock.getElapsedTime();
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        
        // Log progress occasionally
        if (Math.random() < 0.01) {
            console.log(`Intro animation progress: ${(progress * 100).toFixed(1)}%`);
        }
        
        // Use easing for smoother animation
        const eased = 1 - Math.pow(1 - progress, 3); // Cubic ease-out
        
        if (progress < 1.0) {
            try {
                // Animate camera position from far away to the track
                const targetPosition = new THREE.Vector3();
                
                // Get position on the path at the beginning
                let pathPosition;
                try {
                    // Get the current position on the path based on audio time
                    if (audioElement && energyData.length > 0) {
                        const normalizedPosition = findClosestTimeIndex(audioElement.currentTime, energyData) / energyData.length;
                        pathPosition = path.getPointAt(Math.min(normalizedPosition, 0.99));
                    } else {
                        pathPosition = path.getPointAt(0);
                    }
                } catch (error) {
                    console.error("Error getting path position:", error);
                    pathPosition = new THREE.Vector3(0, 0, 0);
                }
                
                // Calculate tangent for orientation
                let tangent;
                try {
                    // Get tangent at the current audio position
                    if (audioElement && energyData.length > 0) {
                        const normalizedPosition = findClosestTimeIndex(audioElement.currentTime, energyData) / energyData.length;
                        tangent = path.getTangentAt(Math.min(normalizedPosition, 0.99));
                    } else {
                        tangent = path.getTangentAt(0);
                    }
                } catch (error) {
                    console.error("Error getting path tangent:", error);
                    tangent = new THREE.Vector3(1, 0, 0);
                }
                
                // Get normal and binormal vectors to position camera above the track
                const normal = new THREE.Vector3();
                const binormal = new THREE.Vector3();
                const up = new THREE.Vector3(0, 1, 0);
                
                // Get the normal by crossing tangent with global up vector
                // and then cross again with tangent to ensure orthogonality
                binormal.crossVectors(tangent, up).normalize();
                normal.crossVectors(binormal, tangent).normalize();
                
                // Position camera above the track (along the normal vector)
                const heightAboveTrack = 4; // Same as config.defaultHeightAboveTrack
                
                // Calculate the first-person position and orientation for smooth transition
                // This is similar to what updateCameraPosition does in camera.js
                const firstPersonPosition = new THREE.Vector3().copy(pathPosition).add(
                    normal.clone().multiplyScalar(heightAboveTrack)
                );
                
                // Calculate the first-person look-at point (looking ahead on the track)
                const lookAheadPosition = Math.min(
                    (findClosestTimeIndex(audioElement.currentTime, energyData) / energyData.length) + 0.01, 
                    0.99
                );
                const firstPersonLookAt = path.getPointAt(lookAheadPosition);
                
                // For the final 20% of the animation, start blending to the first-person position
                let targetPoint, lookAtPoint;
                
                if (progress > 0.8) {
                    // Calculate blend factor for the last 20% of animation (0 to 1)
                    const blendFactor = (progress - 0.8) / 0.2;
                    
                    // Create a curved path for more dramatic effect
                    // Start high and far away, then swoop in
                    const curveX = THREE.MathUtils.lerp(0, firstPersonPosition.x, eased);
                    const curveY = THREE.MathUtils.lerp(2000, firstPersonPosition.y, eased);
                    const curveZ = THREE.MathUtils.lerp(2000, firstPersonPosition.z, eased);
                    
                    // Add a slight arc to the camera path
                    const arcHeight = 400 * (1 - eased) * Math.sin(eased * Math.PI);
                    
                    // Blend between the intro animation path and the first-person position
                    camera.position.x = THREE.MathUtils.lerp(curveX, firstPersonPosition.x, blendFactor);
                    camera.position.y = THREE.MathUtils.lerp(curveY + arcHeight, firstPersonPosition.y, blendFactor);
                    camera.position.z = THREE.MathUtils.lerp(curveZ, firstPersonPosition.z, blendFactor);
                    
                    // Blend the look-at point
                    const centerPoint = new THREE.Vector3(0, 0, 0);
                    lookAtPoint = new THREE.Vector3();
                    lookAtPoint.x = THREE.MathUtils.lerp(
                        THREE.MathUtils.lerp(centerPoint.x, firstPersonLookAt.x, eased),
                        firstPersonLookAt.x, 
                        blendFactor
                    );
                    lookAtPoint.y = THREE.MathUtils.lerp(
                        THREE.MathUtils.lerp(centerPoint.y, firstPersonLookAt.y, eased),
                        firstPersonLookAt.y, 
                        blendFactor
                    );
                    lookAtPoint.z = THREE.MathUtils.lerp(
                        THREE.MathUtils.lerp(centerPoint.z, firstPersonLookAt.z, eased),
                        firstPersonLookAt.z, 
                        blendFactor
                    );
                    
                    // Blend camera roll
                    camera.rotation.z = THREE.MathUtils.lerp(
                        THREE.MathUtils.lerp(THREE.MathUtils.degToRad(5), 0, eased),
                        0,
                        blendFactor
                    );
                } else {
                    // Regular intro animation path for the first 80%
                    const targetPoint = new THREE.Vector3().copy(pathPosition).add(normal.multiplyScalar(heightAboveTrack));
                    
                    // Create a curved path for more dramatic effect
                    // Start high and far away, then swoop in
                    const curveX = THREE.MathUtils.lerp(0, targetPoint.x, eased);
                    const curveY = THREE.MathUtils.lerp(2000, targetPoint.y, eased);
                    const curveZ = THREE.MathUtils.lerp(2000, targetPoint.z, eased);
                    
                    // Add a slight arc to the camera path
                    const arcHeight = 400 * (1 - eased) * Math.sin(eased * Math.PI);
                    
                    // Apply position with arc
                    camera.position.x = curveX;
                    camera.position.y = curveY + arcHeight;
                    camera.position.z = curveZ;
                    
                    // Gradually look from center to forward along track
                    lookAtPoint = new THREE.Vector3();
                    
                    // Start looking at center, end looking at a point ahead on the track
                    const centerPoint = new THREE.Vector3(0, 0, 0);
                    let aheadPoint;
                    try {
                        // Look ahead based on current audio position
                        if (audioElement && energyData.length > 0) {
                            const normalizedPosition = findClosestTimeIndex(audioElement.currentTime, energyData) / energyData.length;
                            const lookAheadPosition = Math.min(normalizedPosition + 0.01, 0.99);
                            aheadPoint = path.getPointAt(lookAheadPosition);
                        } else {
                            aheadPoint = path.getPointAt(0.01);
                        }
                    } catch (error) {
                        console.error("Error getting ahead point:", error);
                        aheadPoint = new THREE.Vector3(10, 0, 0);
                    }
                    
                    lookAtPoint.x = THREE.MathUtils.lerp(centerPoint.x, aheadPoint.x, eased);
                    lookAtPoint.y = THREE.MathUtils.lerp(centerPoint.y, aheadPoint.y, eased);
                    lookAtPoint.z = THREE.MathUtils.lerp(centerPoint.z, aheadPoint.z, eased);
                    
                    // Add a slight camera roll that gradually levels out
                    camera.rotation.z = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(5), 0, eased);
                }
                
                // Apply the look-at
                camera.lookAt(lookAtPoint);
                
                // Gradually increase fog density for immersive effect
                if (scene.fog && scene.fog.density) {
                    scene.fog.density = THREE.MathUtils.lerp(0.005, originalFogDensity, eased);
                }
                
                // Update bloom effect for dramatic reveal
                if (composer && composer.passes) {
                    composer.passes.forEach(pass => {
                        if (pass.name === 'UnrealBloomPass') {
                            // Start with high bloom, reduce to normal
                            pass.strength = THREE.MathUtils.lerp(2.0, 0.5, eased);
                        }
                    });
                }
                
                // Fade in UI elements near the end of the animation
                if (progress > 0.8) {
                    const uiFadeProgress = (progress - 0.8) / 0.2; // Normalize to 0-1 for last 20% of animation
                    const uiOpacity = uiFadeProgress.toFixed(2);
                    document.getElementById('info').style.opacity = uiOpacity;
                    document.getElementById('controls').style.opacity = uiOpacity;
                    document.getElementById('view-controls').style.opacity = uiOpacity;
                    document.getElementById('back-to-menu').style.opacity = uiOpacity;
                }
            } catch (error) {
                console.error("Error in intro animation frame:", error);
                // Continue animation despite errors
            }
            
            // Continue animation
            requestAnimationFrame(animateIntro);
        } else {
            // Animation complete, but we'll manage a smooth transition to first person mode
            // Don't immediately restore first person mode or end the animation
            
            // Gradually transition to normal camera control over 2 seconds
            const transitionDuration = 2.0;
            const transitionStartTime = clock.getElapsedTime();
            
            // Store the final camera position/rotation from the intro animation
            const introEndPosition = camera.position.clone();
            const introEndRotation = new THREE.Euler().copy(camera.rotation);
            
            // Create a function to handle the transition
            function smoothTransitionToFirstPerson() {
                console.log("Starting smooth transition to first person camera");
                
                const transitionDuration = 2000; // 2 seconds
                const startTime = Date.now();
                const fadeInTime = startTime + transitionDuration * 0.35; // Earlier fade in at 35% of the transition
                const fadeOutTime = startTime + transitionDuration * 0.65; // Later fade out at 65% of the transition
                let fadedIn = false;
                let fadedOut = false;
                
                // Store initial camera values
                const initialPosition = camera.position.clone();
                const initialQuaternion = camera.quaternion.clone();
                
                // Create and prepare the fade overlay immediately
                const fadeOverlay = createFadeOverlay();
                // Ensure the overlay is at opacity 0 initially
                fadeOverlay.style.opacity = '0';
                // Add a more dramatic flash by setting a brighter white and adding a glow
                fadeOverlay.style.backgroundColor = 'white';
                fadeOverlay.style.boxShadow = 'inset 0 0 50px rgba(255,255,255,0.8)';
                console.log("Fade overlay prepared for transition");
                
                // First person camera update logic from updateCameraPosition function
                // ... existing code ...
                
                function updateTransition() {
                    const now = Date.now();
                    const elapsed = now - startTime;
                    
                    // Handle fade to white during the middle of the transition
                    if (!fadedIn && now >= fadeInTime) {
                        fadedIn = true;
                        console.log("FLASH: Triggering fade to white at", elapsed, "ms");
                        
                        // Create backup DOM element for the flash (triple redundancy approach)
                        const backupFlash = document.createElement('div');
                        backupFlash.className = 'fade-overlay-active';
                        document.body.appendChild(backupFlash);
                        
                        // Use CSS animation as primary backup
                        document.body.classList.add('flash-white');
                        
                        // Log message for debugging
                        console.log("White flash triggered - using multiple approaches for visibility");
                        
                        // Use our main approach with the fade overlay
                        fadeToWhite(300).then(() => {
                            console.log("White flash visible phase complete");
                        });
                        
                        // Clean up backup after appropriate delay
                        setTimeout(() => {
                            document.body.classList.remove('flash-white');
                            if (document.body.contains(backupFlash)) {
                                backupFlash.classList.add('fade-out');
                                setTimeout(() => {
                                    if (document.body.contains(backupFlash)) {
                                        document.body.removeChild(backupFlash);
                                    }
                                }, 1000);
                            }
                        }, 500);
                    }
                    
                    if (fadedIn && !fadedOut && now >= fadeOutTime) {
                        fadedOut = true;
                        console.log("Triggering fade from white at", elapsed, "ms");
                        
                        // Ensure the overlay is fully visible before starting the fade out
                        const fadeOverlay = document.getElementById('fade-overlay');
                        if (fadeOverlay) {
                            // Force a reflow to ensure opacity transitions work properly
                            fadeOverlay.offsetHeight;
                            
                            // Trigger the fade out with increased duration for smoother transition
                            fadeFromWhite(500).then(() => {
                                console.log("Fade out complete");
                            });
                        } else {
                            console.warn("Fade overlay not found for fade out");
                        }
                    }
                    
                    if (elapsed < transitionDuration) {
                        try {
                            // Calculate progress of the transition
                            const transitionProgress = Math.min(elapsed / transitionDuration, 1.0);
                            
                            // Get the rollercoaster path
                            const path = getRollercoasterPath();
                            if (!path) throw new Error("Path not found during transition");
                            
                            // Get audio element
                            const audioElement = getAudioElement();
                            if (!audioElement) throw new Error("Audio element not found during transition");
                            
                            // Calculate what the first-person camera position would be
                            // This is similar to what's in updateCameraPosition
                            const normalizedPosition = findClosestTimeIndex(audioElement.currentTime, energyData) / energyData.length;
                            
                            // Get position on the path
                            const pathPosition = path.getPointAt(Math.min(normalizedPosition, 0.99));
                            
                            // Get the tangent for camera orientation
                            const tangent = path.getTangentAt(Math.min(normalizedPosition, 0.99));
                            
                            // Calculate normal and binormal for orientation
                            const normal = new THREE.Vector3();
                            const binormal = new THREE.Vector3();
                            const up = new THREE.Vector3(0, 1, 0);
                            
                            // Get the frame vectors
                            binormal.crossVectors(tangent, up).normalize();
                            normal.crossVectors(binormal, tangent).normalize();
                            
                            // Calculate where first-person camera should be
                            const heightAboveTrack = 4; // Same as config.defaultHeightAboveTrack
                            const fpvPosition = new THREE.Vector3().copy(pathPosition).add(
                                normal.clone().multiplyScalar(heightAboveTrack)
                            );
                            
                            // Calculate look ahead point
                            const lookAheadPosition = Math.min(normalizedPosition + 0.01, 0.99);
                            const fpvLookAt = path.getPointAt(lookAheadPosition);
                            
                            // Create temporary camera to get rotation
                            const tempCamera = new THREE.PerspectiveCamera();
                            tempCamera.position.copy(fpvPosition);
                            tempCamera.lookAt(fpvLookAt);
                            const fpvRotation = tempCamera.rotation.clone();
                            
                            // Smoothly blend from intro end position to fpv position
                            // Use easeInOutQuad for smoother transition
                            const easeInOutQuad = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                            const easedProgress = easeInOutQuad(transitionProgress);
                            
                            // Interpolate position
                            camera.position.lerpVectors(introEndPosition, fpvPosition, easedProgress);
                            
                            // Interpolate rotation - need to use quaternions for smooth rotation
                            const introQuaternion = new THREE.Quaternion().setFromEuler(introEndRotation);
                            const fpvQuaternion = new THREE.Quaternion().setFromEuler(fpvRotation);
                            const resultQuaternion = new THREE.Quaternion().copy(introQuaternion);
                            
                            // Use slerp as an instance method, not a static method
                            resultQuaternion.slerp(fpvQuaternion, easedProgress);
                            camera.quaternion.copy(resultQuaternion);
                            
                            // Debug logging
                            if (Math.random() < 0.01) {
                                console.log(`Transition progress: ${Math.round(transitionProgress * 100)}% - Position: ${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}`);
                            }
                            
                            requestAnimationFrame(updateTransition);
                        } catch (error) {
                            console.error("Error during camera transition:", error);
                            state.firstPersonMode = true;
                            introAnimationComplete = true;
                            isIntroAnimationActive = false;
                            
                            // In case of error, ensure we fade out
                            if (fadedIn && !fadedOut) {
                                fadeFromWhite(300);
                            }
                        }
                    } else {
                        // Transition complete, fully enable first person mode
                        console.log("Camera transition complete, enabling regular camera control");
                        state.firstPersonMode = true; // Ensure first person mode is enabled
                        introAnimationComplete = true;
                        isIntroAnimationActive = false; // Clear intro animation state
                        
                        // Ensure the fade from white is complete
                        if (!fadedOut) {
                            fadeFromWhite(300);
                        }
                    }
                }
                
                // Start the transition
                updateTransition();
            }
            
            // Start the transition
            smoothTransitionToFirstPerson();
            
            // Ensure UI elements are fully visible
            document.getElementById('info').style.opacity = '1';
            document.getElementById('controls').style.opacity = '1';
            document.getElementById('view-controls').style.opacity = '1';
            document.getElementById('back-to-menu').style.opacity = '1';
            
            console.log("Intro animation complete, starting smooth transition to first-person mode");
        }
    }
    
    // Start the intro animation
    console.log("Starting intro animation loop");
    animateIntro();
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
        
        // Only update camera position if intro animation is not active
        if (!isIntroAnimationActive) {
            // Always update camera position along path based on current time
            // This allows scrubbing through the visualization even when paused
            updateCameraPosition(getRollercoasterPath(), audioElement, energyData);
        }
        
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

// Add a style for the backup approach - more dramatic with better animation
const flashStyle = document.createElement('style');
flashStyle.innerHTML = `
    /* The primary flash effect using ::before pseudo-element */
    .flash-white::before {
        content: '';
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: white;
        z-index: 9999;
        pointer-events: none;
        box-shadow: inset 0 0 100px rgba(255,255,255,1);
        animation: flash-fade 3.0s cubic-bezier(0.4, 0.0, 0.2, 1) forwards; /* Increased from 0.8s to 3.0s */
    }
    
    /* Enhanced animation with longer visible duration */
    @keyframes flash-fade {
        0%, 40% { opacity: 1; } /* Extended visible time from 30% to 40% */
        100% { opacity: 0; }
    }
    
    /* Add a fade overlay class as additional backup */
    .fade-overlay-active {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: white;
        z-index: 9998;
        pointer-events: none;
        opacity: 1;
        transition: opacity 3.5s cubic-bezier(0.4, 0.0, 0.2, 1); /* Increased from 0.8s to 3.5s to match other timing */
    }
    
    .fade-overlay-active.fade-out {
        opacity: 0;
    }
`;
document.head.appendChild(flashStyle);