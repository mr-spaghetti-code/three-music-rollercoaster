// Camera and controls setup for the music visualization

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FirstPersonControls } from 'three/addons/controls/FirstPersonControls.js';
import { config, state } from './config.js';
import { findNormalizedPositionFromTime } from './utils.js';

// Camera control variables
let camera, firstPersonControls, orbitControls;
let clock = new THREE.Clock();

// Initialize camera and controls
export function setupCamera(scene, renderer) {
    // Set up camera
    camera = new THREE.PerspectiveCamera(
        config.cameraFOV, 
        window.innerWidth / window.innerHeight, 
        config.cameraNear, 
        config.cameraFar
    );
    camera.position.set(0, 2, 0);
    
    // Set up controls
    firstPersonControls = new FirstPersonControls(camera, renderer.domElement);
    firstPersonControls.movementSpeed = 0;
    firstPersonControls.lookSpeed = 0.1;
    firstPersonControls.lookVertical = true;
    firstPersonControls.constrainVertical = true;
    firstPersonControls.verticalMin = Math.PI / 6;
    firstPersonControls.verticalMax = Math.PI / 2.2;
    
    // Orbit controls (for free look)
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.enableZoom = true;
    orbitControls.minDistance = 5;
    orbitControls.maxDistance = 200;
    orbitControls.enablePan = true;
    orbitControls.autoRotate = false;
    orbitControls.autoRotateSpeed = 0.5;
    
    // Toggle controls based on mode
    firstPersonControls.enabled = state.firstPersonMode;
    orbitControls.enabled = !state.firstPersonMode;
    
    // Add keyboard event for switching modes
    window.addEventListener('keydown', function(event) {
        if (event.key === 'v') {
            toggleViewMode();
        }
    });
    
    console.log(`Initial camera mode: ${state.firstPersonMode ? 'First Person' : 'Orbit'}`);
    
    return { camera, firstPersonControls, orbitControls };
}

// Toggle between first person and orbit camera modes
export function toggleViewMode(rollercoasterPath, audioElement) {
    state.firstPersonMode = !state.firstPersonMode;
    firstPersonControls.enabled = state.firstPersonMode;
    orbitControls.enabled = !state.firstPersonMode;
    
    // Update button text
    const button = document.getElementById('toggle-view');
    button.querySelector('.control-icon').textContent = state.firstPersonMode ? '👁️' : '🔄';
    
    // If switching to orbit mode, set the orbit target to a point ahead on the track
    if (!state.firstPersonMode && rollercoasterPath) {
        try {
            const normalizedPosition = findNormalizedPositionFromTime(audioElement.currentTime, window.energyData);
            const lookAheadPosition = Math.min(normalizedPosition + 0.05, 0.99); // Avoid exactly 1.0 which can cause issues
            const targetPoint = rollercoasterPath.getPointAt(lookAheadPosition);
            
            // Validate the target point before using it
            if (targetPoint && typeof targetPoint.x === 'number' && 
                typeof targetPoint.y === 'number' && 
                typeof targetPoint.z === 'number') {
                orbitControls.target.copy(targetPoint);
            } else {
                // Fallback to a default target
                orbitControls.target.set(0, 20, 0);
            }
        } catch (error) {
            console.error("Error setting orbit controls target:", error);
            // Fallback to a default target
            orbitControls.target.set(0, 20, 0);
        }
    }
    
    console.log(`Camera mode switched to: ${state.firstPersonMode ? 'First Person' : 'Orbit'}`);
}

// Update camera position along rollercoaster path
export function updateCameraPosition(rollercoasterPath, audioElement, energyData) {
    if (!state.firstPersonMode || !rollercoasterPath || !energyData[state.currentIndex]) {
        return;
    }
    
    // Calculate position along the path based on current time directly
    // This ensures smooth movement instead of only updating on timeupdate events
    if (audioElement) {
        const exactTime = audioElement.currentTime;
        
        // Find the precise position along the path
        const normalizedPosition = findNormalizedPositionFromTime(exactTime, energyData);
        
        // Calculate rate of energy change for camera effects
        const currentEnergyIndex = Math.floor(findNormalizedPositionFromTime(exactTime, energyData));
        const prevEnergyIndex = Math.max(0, currentEnergyIndex - 1);
        const nextEnergyIndex = Math.min(energyData.length - 1, currentEnergyIndex + 1);
        
        let energyChangeRate = 0;
        if (energyData[nextEnergyIndex] && energyData[prevEnergyIndex] && 
            typeof energyData[nextEnergyIndex].energy === 'number' && 
            typeof energyData[prevEnergyIndex].energy === 'number') {
            // Calculate rate of change (derivative)
            energyChangeRate = (energyData[nextEnergyIndex].energy - energyData[prevEnergyIndex].energy) / 2;
        }
        
        // Ensure normalized position is valid (between 0 and 1)
        const safePosition = Math.max(0, Math.min(0.99, normalizedPosition));
        
        try {
            // Get position on the path
            const position = rollercoasterPath.getPointAt(safePosition);
            
            // Validate position before using it
            if (!position || typeof position.x !== 'number' || 
                typeof position.y !== 'number' || 
                typeof position.z !== 'number') {
                throw new Error("Invalid position from getPointAt");
            }
            
            // Calculate tangent for orientation
            const tangent = rollercoasterPath.getTangentAt(safePosition);
            
            // Validate tangent before using it
            if (!tangent || typeof tangent.x !== 'number' || 
                typeof tangent.y !== 'number' || 
                typeof tangent.z !== 'number') {
                throw new Error("Invalid tangent from getTangentAt");
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
            // Add dynamic camera height that varies with energy change rate
            // Lower camera during drops, raise during climbs
            const baseHeightAboveTrack = config.defaultHeightAboveTrack;
            const dynamicHeightAdjustment = energyChangeRate * 3; // Lower during drops (negative change), higher during climbs
            const heightAboveTrack = Math.max(2, baseHeightAboveTrack - dynamicHeightAdjustment);
            
            camera.position.copy(position).add(normal.multiplyScalar(heightAboveTrack));
            
            // Look ahead in the direction of the track
            // Look further ahead during fast sections (energy transitions)
            const baseLookAheadDistance = 0.01; // Base lookahead
            const dynamicLookAhead = baseLookAheadDistance * (1 + Math.abs(energyChangeRate) * 4);
            const lookAheadPosition = Math.min(safePosition + dynamicLookAhead, 0.99);
            const lookAtPoint = rollercoasterPath.getPointAt(lookAheadPosition);
            
            // Validate look-at point
            if (lookAtPoint && typeof lookAtPoint.x === 'number' && 
                typeof lookAtPoint.y === 'number' && 
                typeof lookAtPoint.z === 'number') {
                if (!firstPersonControls.mouseDrag) {
                    camera.lookAt(lookAtPoint);
                }
            }
            
            // Add a slight tilt to simulate rollercoaster physics
            try {
                // Calculate the direction of the next segment
                const nextPos = rollercoasterPath.getPointAt(
                    Math.min(safePosition + 0.01, 0.99)
                );
                const prevPos = rollercoasterPath.getPointAt(
                    Math.max(safePosition - 0.01, 0)
                );
                
                // Validate points
                if (nextPos && prevPos && 
                    typeof nextPos.y === 'number' && typeof prevPos.y === 'number' &&
                    typeof nextPos.x === 'number' && typeof prevPos.x === 'number' &&
                    typeof nextPos.z === 'number' && typeof prevPos.z === 'number') {
                    
                    // Calculate the slope
                    const dx = nextPos.x - prevPos.x;
                    const dz = nextPos.z - prevPos.z;
                    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
                    
                    // Avoid division by zero
                    if (horizontalDistance > 0.001) {
                        const slope = (nextPos.y - prevPos.y) / horizontalDistance;
                        
                        // Enhance tilt effect based on energy change rate
                        // More dramatic tilting during energy transitions
                        const tiltMultiplier = 1.0 + Math.abs(energyChangeRate) * 5;
                        
                        // Apply a tilt based on the slope (going down = tilt forward, going up = tilt back)
                        // Increase the tilt effect for more dramatic feeling
                        const tiltAngle = Math.atan(slope) * 0.8 * tiltMultiplier; // Increased tilt effect
                        camera.rotation.x += tiltAngle;
                        
                        // Add a slight roll effect during turns
                        // Calculate turn direction from the change in angle
                        const turnDirection = Math.sign(dx * prevPos.z - dz * prevPos.x);
                        const turnSharpness = Math.min(1, Math.sqrt(dx*dx + dz*dz) / 10);
                        
                        // Add roll effect (tilt sideways) during turns
                        const rollAngle = turnDirection * turnSharpness * 0.2 * tiltMultiplier;
                        camera.rotation.z += rollAngle;
                    }
                }
            } catch (innerError) {
                console.warn("Error calculating camera tilt:", innerError);
            }
            
            // Add camera shake during intense moments (high energy change rate)
            if (Math.abs(energyChangeRate) > 0.05) {
                const shakeIntensity = Math.abs(energyChangeRate) * 0.05;
                camera.position.x += (Math.random() - 0.5) * shakeIntensity;
                camera.position.y += (Math.random() - 0.5) * shakeIntensity;
                camera.position.z += (Math.random() - 0.5) * shakeIntensity;
            }
            
        } catch (error) {
            console.error(`Error updating camera position at t=${safePosition}:`, error);
        }
    }
}

// Update controls based on delta time
export function updateControls(delta) {
    if (state.firstPersonMode) {
        firstPersonControls.update(delta);
    } else {
        orbitControls.update();
    }
}

// Handle window resize
export function handleResize() {
    if (camera) {
        // Fix aspect ratio
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        
        console.log(`Resized camera: ${window.innerWidth}x${window.innerHeight}, aspect: ${camera.aspect}`);
    }
}

// Get the camera object
export function getCamera() {
    return camera;
}

// Get the clock
export function getClock() {
    return clock;
} 