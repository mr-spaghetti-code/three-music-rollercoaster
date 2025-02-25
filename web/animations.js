// Animations for objects in the music visualization

import * as THREE from 'three';
import { state } from './config.js';

// Define discrete locations for objects to move to
// These will be used as target positions for the tweened animations
const discreteLocations = [];

// Initialize discrete locations grid
function initDiscreteLocations() {
    // Create a grid of positions in 3D space
    const gridSize = 10; // 10x10x10 grid
    const spacing = 60;  // Reduced from 100 to 60 to make movements less dramatic
    const centerOffset = (gridSize * spacing) / 2; // Center the grid
    
    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            for (let z = 0; z < gridSize; z++) {
                discreteLocations.push(new THREE.Vector3(
                    x * spacing - centerOffset,
                    y * spacing,
                    -z * spacing - 500 // Start 500 units away and go deeper
                ));
            }
        }
    }
    
    console.log(`Created ${discreteLocations.length} discrete locations for object movement`);
}

// Resample which objects can move discretely
// This should be called whenever the zone changes
export function resampleMoveableObjects(animatedObjects) {
    console.log("Resampling objects that can move discretely");
    
    // Count objects before resampling
    let beforeCount = 0;
    animatedObjects.forEach(obj => {
        if (obj.userData && obj.userData.canMoveDiscrete) {
            beforeCount++;
        }
    });
    
    // Set a higher percentage of objects that can move (70%)
    const moveablePercentage = 0.7;
    
    // Resample which objects can move
    animatedObjects.forEach(obj => {
        if (obj.userData) {
            // Reset movement flag based on random chance
            // But only for objects that should be eligible for movement
            if (obj.userData.type && 
                (obj.userData.type.includes('Object') || 
                 obj.userData.type === 'geometric' || 
                 obj.userData.animationType)) {
                
                obj.userData.canMoveDiscrete = Math.random() < moveablePercentage;
                
                // If this object can now move, make sure it has required properties
                if (obj.userData.canMoveDiscrete) {
                    // Store original emissive if it has a material with emissive property
                    if (obj.material && obj.material.emissive && !obj.userData.originalEmissive) {
                        obj.userData.originalEmissive = obj.material.emissive.clone();
                    }
                    
                    // Store original position if not already stored
                    if (!obj.userData.originalPosition) {
                        obj.userData.originalPosition = obj.position.clone();
                    }
                    
                    // Store original scale if not already stored
                    if (!obj.userData.originalScale) {
                        obj.userData.originalScale = obj.scale.clone();
                    }
                }
            }
        }
    });
    
    // Count objects after resampling
    let afterCount = 0;
    animatedObjects.forEach(obj => {
        if (obj.userData && obj.userData.canMoveDiscrete) {
            afterCount++;
        }
    });
    
    console.log(`Resampled moveable objects: ${beforeCount} before, ${afterCount} after`);
    return afterCount;
}

// Initialize the discrete locations when this module loads
initDiscreteLocations();

// Move object to a random discrete location with tweened animation
function moveToDiscreteLocation(obj, bassIntensity, midIntensity, trebleIntensity) {
    // Only move objects that have the 'canMoveDiscrete' flag in their userData
    if (!obj.userData.canMoveDiscrete) {
        return;
    }
    
    // Select a random location from the discrete locations
    const targetLocation = discreteLocations[Math.floor(Math.random() * discreteLocations.length)];
    
    // Store the current position as the previous position
    if (!obj.userData.previousPosition) {
        obj.userData.previousPosition = obj.position.clone();
    } else {
        obj.userData.previousPosition.copy(obj.position);
    }
    
    // Calculate distance to target
    const distance = obj.position.distanceTo(targetLocation);
    
    // Limit travel distance - FURTHER REDUCED to be even less distracting
    // Changed from 150 to 100 to make movements even more subtle
    const maxDistance = 100;
    let targetPos = targetLocation.clone();
    
    if (distance > maxDistance) {
        // Create a new target that's in the same direction but closer
        const direction = new THREE.Vector3().subVectors(targetLocation, obj.position).normalize();
        targetPos = new THREE.Vector3().copy(obj.position).addScaledVector(direction, maxDistance);
    }
    
    // Calculate animation duration based on music beat
    // Assume average beat duration is around 0.5 seconds (120 BPM)
    // We can adjust this to match the specific song if tempo data is available
    const beatDuration = 0.5; // Default beat duration for 120 BPM
    
    // Adjust duration slightly based on audio intensity, but keep it close to one beat
    const durationVariation = 0.2; // Allow 20% variation from beat
    const duration = beatDuration * (1 - durationVariation + durationVariation * 2 * Math.random());
    
    // Debug: Log movement more frequently
    if (Math.random() < 0.3) { // Increased from 0.1 to 0.3 (30% of movements)
        console.log(`Moving ${obj.userData.type} to discrete location:`, 
            `From (${obj.position.x.toFixed(0)}, ${obj.position.y.toFixed(0)}, ${obj.position.z.toFixed(0)})`,
            `To (${targetPos.x.toFixed(0)}, ${targetPos.y.toFixed(0)}, ${targetPos.z.toFixed(0)})`,
            `Duration: ${duration.toFixed(2)}s, Audio: Bass=${bassIntensity.toFixed(2)}, Mid=${midIntensity.toFixed(2)}`);
    }
    
    // Track total objects moving
    window.objectsMovingToDiscreteLocations = (window.objectsMovingToDiscreteLocations || 0) + 1;
    
    // Only create trails for a small percentage of objects to reduce lag
    // Also check if we have too many objects moving at once
    const currentlyMoving = window.currentlyMovingObjects || 0;
    window.currentlyMovingObjects = currentlyMoving + 1;
    
    // Create a visual trail effect only for 15% of movements and when we don't have too many objects moving
    if (Math.random() < 0.15 && currentlyMoving < 10) {
        createMovementTrail(obj, targetPos, duration, bassIntensity);
    }
    
    // Choose an easing function based on the audio characteristics
    let ease;
    if (bassIntensity > 0.7) {
        // Strong bass - bouncy movement
        ease = "elastic.out(1, 0.3)";
    } else if (midIntensity > 0.7) {
        // Strong mids - smooth movement
        ease = "sine.inOut";
    } else if (trebleIntensity > 0.7) {
        // Strong treble - quick, sharp movement
        ease = "power2.out";
    } else {
        // Default - balanced movement
        ease = "power1.inOut";
    }
    
    // Make sure GSAP is available
    if (typeof gsap === 'undefined') {
        console.error("GSAP not available for animations - objects won't move");
        return;
    }
    
    // Store original rotation
    const originalRotation = {
        x: obj.rotation.x,
        y: obj.rotation.y, 
        z: obj.rotation.z
    };
    
    // Generate random spin amount based on audio intensity
    const spinIntensity = 0.5 + (bassIntensity + midIntensity) * 1.5;
    const randomSpins = {
        x: (Math.random() < 0.5 ? Math.PI * 2 : 0) * spinIntensity * (Math.random() < 0.5 ? -1 : 1),
        y: (Math.random() < 0.7 ? Math.PI * 2 : 0) * spinIntensity * (Math.random() < 0.5 ? -1 : 1),
        z: (Math.random() < 0.5 ? Math.PI * 2 : 0) * spinIntensity * (Math.random() < 0.5 ? -1 : 1)
    };
    
    // Add full random spins during movement (up to 2 complete rotations)
    gsap.to(obj.rotation, {
        x: originalRotation.x + randomSpins.x,
        y: originalRotation.y + randomSpins.y,
        z: originalRotation.z + randomSpins.z,
        duration: duration,
        ease: "power1.inOut"
    });
    
    // Use GSAP to animate the position
    gsap.to(obj.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: duration,
        ease: ease,
        onComplete: () => {
            // Mark the object as having completed its movement
            obj.userData.lastMoveTime = Date.now();
            // Decrement the count of currently moving objects
            window.currentlyMovingObjects = (window.currentlyMovingObjects || 1) - 1;
            // Log completion for debugging
            if (Math.random() < 0.1) {
                console.log(`Object movement complete: ${obj.userData.type}`);
            }
        }
    });
    
    // Also animate rotation to face the direction of movement
    // This is now complementary to the random spins added above
    const direction = new THREE.Vector3().subVectors(targetPos, obj.position).normalize();
    const targetRotation = new THREE.Euler();
    
    // Calculate target rotation to face the movement direction
    targetRotation.y = Math.atan2(direction.x, direction.z);
    targetRotation.x = Math.atan2(-direction.y, Math.sqrt(direction.x * direction.x + direction.z * direction.z));
    
    // We don't need this separate rotation animation anymore since we're doing random spins
    // Instead we'll just add a subtle wobble
    gsap.to(obj.rotation, {
        x: originalRotation.x + randomSpins.x + Math.random() * 0.2 - 0.1,
        y: originalRotation.y + randomSpins.y + Math.random() * 0.2 - 0.1, 
        z: originalRotation.z + randomSpins.z + Math.random() * 0.2 - 0.1,
        duration: duration * 1.2, // Slightly longer than the movement
        ease: "elastic.out(1, 0.3)",
        delay: duration  // Apply this after the main spin
    });
    
    // Add a scale pulse effect during movement
    const originalScale = obj.userData.originalScale || new THREE.Vector3(1, 1, 1);
    const scaleFactor = 1.0 + bassIntensity * 0.5;
    
    gsap.to(obj.scale, {
        x: originalScale.x * scaleFactor,
        y: originalScale.y * scaleFactor,
        z: originalScale.z * scaleFactor,
        duration: duration * 0.3,
        ease: "power2.out",
        onComplete: () => {
            // Return to original scale
            gsap.to(obj.scale, {
                x: originalScale.x,
                y: originalScale.y,
                z: originalScale.z,
                duration: duration * 0.7,
                ease: "elastic.out(1, 0.3)"
            });
        }
    });
    
    // If the object has a material, animate its color or emissive properties
    if (obj.material) {
        if (obj.material.emissive) {
            const originalEmissive = obj.userData.originalEmissive || new THREE.Color(0x000000);
            const targetEmissive = new THREE.Color().setHSL(Math.random(), 0.8, 0.5);
            
            gsap.to(obj.material.emissive, {
                r: targetEmissive.r,
                g: targetEmissive.g,
                b: targetEmissive.b,
                duration: duration * 0.5,
                ease: "power1.inOut",
                onComplete: () => {
                    // Return to original emissive
                    gsap.to(obj.material.emissive, {
                        r: originalEmissive.r,
                        g: originalEmissive.g,
                        b: originalEmissive.b,
                        duration: duration * 0.5,
                        ease: "power1.inOut"
                    });
                }
            });
        }
    }
}

// Create a visual trail effect for objects moving to discrete locations
function createMovementTrail(obj, targetLocation, duration, intensity) {
    // Only create trails if we have access to the scene
    if (!window.scene) return;
    
    // Number of trail segments based on distance and intensity - reduced for performance
    const distance = obj.position.distanceTo(targetLocation);
    const segments = Math.min(8, Math.max(3, Math.floor(distance / 60) + Math.floor(intensity * 3)));
    
    // Create trail points along the path
    const startPoint = obj.position.clone();
    const direction = new THREE.Vector3().subVectors(targetLocation, startPoint).normalize();
    const trailObjects = [];
    
    // Create a trail of small objects - use a simpler geometry for better performance
    const geometry = new THREE.SphereGeometry(0.5, 4, 2); // Further reduced segment count
    
    // Use a shared material for all trail objects to reduce draw calls
    const material = new THREE.MeshBasicMaterial({
        color: obj.material && obj.material.color ? obj.material.color.clone() : new THREE.Color(0xffffff),
        transparent: true,
        opacity: 0.5,
    });
    
    // Create a group to hold all trail objects for easier management
    const trailGroup = new THREE.Group();
    window.scene.add(trailGroup);
    
    for (let i = 1; i <= segments; i++) {
        // Calculate position along the path
        const t = i / (segments + 1);
        const curveT = t * t * (3 - 2 * t); // Smooth curve interpolation
        
        // Add minimal randomness to the path
        const randomOffset = new THREE.Vector3(
            (Math.random() - 0.5) * 3 * intensity,
            (Math.random() - 0.5) * 3 * intensity,
            (Math.random() - 0.5) * 3 * intensity
        );
        
        // Calculate position with curve and randomness
        const position = new THREE.Vector3()
            .lerpVectors(startPoint, targetLocation, curveT)
            .add(randomOffset);
        
        const trailObj = new THREE.Mesh(geometry, material);
        trailObj.position.copy(position);
        trailObj.scale.multiplyScalar(0.5 + (1 - t) * 0.5); // Smaller objects toward the end
        
        // Add to trail group
        trailGroup.add(trailObj);
        trailObjects.push(trailObj);
    }
    
    // Animate the entire trail group at once instead of individual objects
    gsap.to(material, {
        opacity: 0,
        duration: duration * 0.8,
        ease: "power1.in",
        onComplete: () => {
            // Remove from scene when animation is complete
            window.scene.remove(trailGroup);
            geometry.dispose();
            material.dispose();
            
            // Clear the group
            while(trailGroup.children.length > 0) {
                trailGroup.remove(trailGroup.children[0]);
            }
        }
    });
    
    // Scale down the trail group
    gsap.to(trailGroup.scale, {
        x: 0.1,
        y: 0.1,
        z: 0.1,
        duration: duration * 0.8,
        ease: "power1.in"
    });
}

// Animate objects based on audio data
export function animateObjects(timeStep, audioData, animatedObjects, energyData) {
    // Debug: Log animation status periodically
    const now = Date.now();
    if (!window.lastAnimationDebugTime || now - window.lastAnimationDebugTime > 5000) {
        console.log(`Animating ${animatedObjects.length} objects`);
        
        // Count objects by type
        const typeCounts = {};
        let discreteMoveCount = 0;
        
        animatedObjects.forEach(obj => {
            if (obj.userData && obj.userData.type) {
                typeCounts[obj.userData.type] = (typeCounts[obj.userData.type] || 0) + 1;
                
                // Count objects that can move discretely
                if (obj.userData.canMoveDiscrete) {
                    discreteMoveCount++;
                }
            } else {
                typeCounts['unknown'] = (typeCounts['unknown'] || 0) + 1;
            }
        });
        
        console.log('Object types:', typeCounts);
        console.log(`Objects that can move discretely: ${discreteMoveCount}`);
        console.log(`Total discrete movements since start: ${window.objectsMovingToDiscreteLocations || 0}`);
        
        window.lastAnimationDebugTime = now;
    }
    
    // Only animate objects that are visible (in current zone) or are particles or geometric objects
    animatedObjects.forEach(obj => {
        // Check if object exists and has valid properties
        if (!obj || !obj.userData) {
            return;
        }
        
        // Always animate special object types regardless of visibility
        const alwaysAnimateTypes = ['particles', 'geometric', 'psychedelicGround', 'lowObject', 'mediumObject', 'highObject'];
        const isSpecialType = obj.userData.type && alwaysAnimateTypes.some(type => obj.userData.type.includes(type));
        
        // Skip invisible objects unless they're special types
        if (!obj.visible && !isSpecialType) {
            return;
        }
        
        // Get normalized audio data (0-1)
        const energyLevel = energyData[state.currentIndex] ? energyData[state.currentIndex].energy : 0;
        
        // Calculate energy change rate for transition effects
        let energyChangeRate = 0;
        if (state.currentIndex > 0 && state.currentIndex < energyData.length - 1) {
            if (energyData[state.currentIndex+1] && energyData[state.currentIndex-1] && 
                typeof energyData[state.currentIndex+1].energy === 'number' && 
                typeof energyData[state.currentIndex-1].energy === 'number') {
                energyChangeRate = (energyData[state.currentIndex+1].energy - energyData[state.currentIndex-1].energy) / 2;
            }
        }
        
        // Add dramatic transition effects during high energy change rates
        const transitionIntensity = Math.abs(energyChangeRate) * 3;
        
        // Check if we've hit a new bar for object repositioning
        let shouldReposition = false;
        if (window.structureData && state.currentIndex > 0) {
            // Find closest structure point (like a bar boundary)
            const currentTime = energyData[state.currentIndex] ? energyData[state.currentIndex].time : 0;
            
            // Find bar boundaries in structure data
            for (let i = 0; i < window.structureData.length; i++) {
                if (window.structureData[i].feature === "bar_boundaries" && 
                    Math.abs(window.structureData[i].time - currentTime) < 0.1 && 
                    Math.abs(window.structureData[i].time - state.lastBarTime) > 0.5) {
                    // We crossed a bar boundary
                    shouldReposition = true;
                    state.lastBarTime = window.structureData[i].time;
                    break;
                }
            }
        }
        
        // Get frequency data from audio analyzer - these are more responsive than the pre-calculated energy values
        const bassLevel = audioData ? audioData[1] / 255 : 0;
        const midLevel = audioData ? audioData[Math.floor(audioData.length / 3)] / 255 : 0;
        const trebleLevel = audioData ? audioData[Math.floor(audioData.length * 0.8)] / 255 : 0;
        
        // Check if this object should move to a discrete location
        // We'll do this for objects that have the canMoveDiscrete flag and meet certain conditions
        if (obj.userData.canMoveDiscrete) {
            // Only move if:
            // 1. We've hit a bar boundary (most important - sync with music structure) OR
            // 2. There's a significant energy change OR
            // 3. It's been a while since the last move AND there's significant audio intensity
            const timeSinceLastMove = now - (obj.userData.lastMoveTime || 0);
            const audioIntensity = bassLevel + midLevel + trebleLevel;
            
            // Prioritize bar boundaries for better music sync (80% chance)
            if (shouldReposition && Math.random() < 0.8) {
                // Higher chance of moving on bar boundaries to sync with music
                if (Math.random() < 0.7) { // Increased from 0.6 to 0.7 (70% chance to move on a bar boundary)
                    moveToDiscreteLocation(obj, bassLevel, midLevel, trebleLevel);
                }
            }
            // Secondary condition - energy transitions
            else if (transitionIntensity > 0.25 && Math.random() < 0.5) { // Lowered threshold and increased chance
                // Move when there's a significant change in music energy
                if (Math.random() < 0.6) { // Increased from 0.5 to 0.6 (60% chance to move on energy transition)
                    moveToDiscreteLocation(obj, bassLevel, midLevel, trebleLevel);
                }
            }
            // Fallback condition - periodic movement based on audio intensity
            else if (timeSinceLastMove > 3000 && audioIntensity > 0.9 && Math.random() < 0.4) { // More lenient conditions
                // Move after some time has passed and we have enough audio intensity
                moveToDiscreteLocation(obj, bassLevel, midLevel, trebleLevel);
            }
        }
        
        // Handle psychedelic ground animation
        if (obj.userData.type === 'psychedelicGround' && obj.userData.uniforms) {
            const uniforms = obj.userData.uniforms;
            
            // Update time
            uniforms.time.value += timeStep;
            
            // Update audio reactive values
            uniforms.bassIntensity.value = THREE.MathUtils.lerp(uniforms.bassIntensity.value, bassLevel * 1.5, 0.1);
            uniforms.midIntensity.value = THREE.MathUtils.lerp(uniforms.midIntensity.value, midLevel * 1.5, 0.1);
            uniforms.trebleIntensity.value = THREE.MathUtils.lerp(uniforms.trebleIntensity.value, trebleLevel * 1.5, 0.1);
            
            // Slowly shift colors
            uniforms.colorShift.value = (uniforms.colorShift.value + timeStep * 0.05) % 1.0;
            
            // Update zone color if needed
            if (state.currentZone && window.colors && window.colors[state.currentZone + 'Zone']) {
                uniforms.zoneColor.value.set(window.colors[state.currentZone + 'Zone'].main);
            }
            
            return; // Skip other animations for the ground
        }
        
        // Handle rainbow tube animation
        if (obj.userData.type === 'rainbowTube' && obj.userData.uniforms) {
            const uniforms = obj.userData.uniforms;
            
            // Update time
            uniforms.time.value += timeStep;
            
            // Make color speed and density react to audio
            uniforms.colorSpeed.value = THREE.MathUtils.lerp(uniforms.colorSpeed.value, 0.2 + bassLevel * 1.5, 0.1);
            uniforms.colorDensity.value = THREE.MathUtils.lerp(uniforms.colorDensity.value, 2.0 + midLevel * 4.0, 0.1);
            
            // Shift color based on energy level
            const energyShift = energyLevel * 0.5;
            uniforms.colorShift.value = (uniforms.colorShift.value + timeStep * 0.1 + energyShift * 0.01) % 1.0;
            
            return; // Skip other animations for the tube
        }
        
        // Increase the intensity of audio visualization by applying an exponential curve
        const bassIntensity = Math.pow(bassLevel, 1.5) * 1.5;
        const midIntensity = Math.pow(midLevel, 1.5) * 1.5;
        const trebleIntensity = Math.pow(trebleLevel, 1.5) * 1.5;
        
        // Apply psychedelic color shifts if enabled
        if (state.psychedelicEffectsEnabled && obj.material && obj.material.color) {
            // Create a pulsing hue shift based on audio
            const hueShift = (timeStep * 0.1 + bassIntensity * 0.5) % 1.0;
            const saturation = 0.5 + midIntensity * 0.5;
            const lightness = 0.5 + trebleIntensity * 0.3;
            
            // Enhanced color transitions during energy changes
            const transitionHueShift = hueShift + transitionIntensity * 0.2; // Add hue shift during transitions
            const transitionSaturation = saturation + transitionIntensity * 0.3; // More saturated colors during transitions
            const transitionLightness = lightness + transitionIntensity * 0.2; // Brighter during transitions
            
            // Apply different color effects based on object type
            if (obj.userData.type === 'plant' || obj.userData.type === 'tree') {
                // Cycle through colors for plants and trees
                const color = new THREE.Color().setHSL(transitionHueShift % 1.0, 
                                                     Math.min(1, transitionSaturation), 
                                                     Math.min(1, transitionLightness));
                obj.material.color.copy(color);
                
                // Add emissive glow that pulses with the beat
                if (obj.material.emissive) {
                    const emissiveIntensity = bassIntensity * 0.3 + transitionIntensity * 0.4;
                    obj.material.emissive.setHSL((transitionHueShift + 0.5) % 1.0, 0.8, 
                                              Math.min(0.7, emissiveIntensity));
                }
            } else if (obj.userData.type === 'fire') {
                // Fire gets more intense with higher frequencies
                const fireColor = new THREE.Color().setHSL(
                    0.05 + trebleIntensity * 0.1 + transitionIntensity * 0.1, // More color shift during transitions
                    0.8, 
                    0.5 + trebleIntensity * 0.5 + transitionIntensity * 0.2 // Brighter during transitions
                );
                obj.material.color.copy(fireColor);
                
                // Make fire emissive
                if (obj.material.emissive) {
                    obj.material.emissive.copy(fireColor).multiplyScalar(trebleIntensity + transitionIntensity);
                }
            }
        }
        
        // Possibly reposition object if it's time and this object responds to music
        if (shouldReposition && obj.userData.originalPosition && 
            (obj.userData.type === 'plant' || obj.userData.type === 'particle' || 
             obj.userData.type === 'tree' || obj.userData.type === 'geometric' || 
             obj.userData.type === 'fish')) {
            
            // Only reposition sometimes, not on every bar (based on bassIntensity)
            if (Math.random() < 0.2 * (1 + bassIntensity) && 
                (window.audioElement.currentTime - obj.userData.lastRepositionTime) > 2) {
                
                // Get original position
                const origPos = obj.userData.originalPosition;
                
                // Generate a new position nearby
                const range = 40 + bassIntensity * 60; // Movement range increases with bass
                const newX = origPos.x + (Math.random() - 0.5) * range;
                const newY = origPos.y + (Math.random() - 0.5) * range * 0.5; // Less vertical movement
                const newZ = origPos.z + (Math.random() - 0.5) * range;
                
                // Animate to new position
                gsap.to(obj.position, {
                    x: newX,
                    y: newY, 
                    z: newZ,
                    duration: 0.5 + Math.random() * 0.5, // Quick movement
                    ease: "power2.out"
                });
                
                // Update last reposition time
                obj.userData.lastRepositionTime = window.audioElement.currentTime;
            }
        }
        
        // Handle special animation for geometric objects
        if (obj.userData.type === 'geometric') {
            // Continuously rotate
            obj.rotation.x += obj.userData.rotationSpeed.x * (1 + midIntensity);
            obj.rotation.y += obj.userData.rotationSpeed.y * (1 + bassIntensity);
            obj.rotation.z += obj.userData.rotationSpeed.z * (1 + trebleIntensity);
            
            // Pulse scale with the music
            const pulseAmount = Math.sin(timeStep * obj.userData.pulseSpeed) * obj.userData.pulseFactor;
            const scale = 1 + pulseAmount * bassIntensity + transitionIntensity * 0.3;
            obj.scale.set(scale, scale, scale);
            
            // Add floating motion
            const moveX = Math.sin(timeStep * 0.5 + obj.userData.movePhase) * obj.userData.moveDistance * 0.2;
            const moveY = Math.cos(timeStep * 0.3 + obj.userData.movePhase) * obj.userData.moveDistance * 0.2;
            const moveZ = Math.sin(timeStep * 0.7 + obj.userData.movePhase) * obj.userData.moveDistance * 0.2;
            
            // Apply floating motion relative to original position (if not recently repositioned)
            if (window.audioElement && window.audioElement.currentTime - obj.userData.lastRepositionTime > 1) {
                obj.position.x = obj.userData.originalPosition.x + moveX;
                obj.position.y = obj.userData.originalPosition.y + moveY;
                obj.position.z = obj.userData.originalPosition.z + moveZ;
            }
            
            // Additional motion during transitions
            if (transitionIntensity > 0.2) {
                obj.position.x += Math.sin(timeStep * 10) * transitionIntensity * 0.5;
                obj.position.y += Math.cos(timeStep * 12) * transitionIntensity * 0.5;
                obj.position.z += Math.sin(timeStep * 8) * transitionIntensity * 0.5;
                
                // Speed up rotation during transitions
                obj.rotation.x += obj.userData.rotationSpeed.x * transitionIntensity * 5;
                obj.rotation.y += obj.userData.rotationSpeed.y * transitionIntensity * 5;
                obj.rotation.z += obj.userData.rotationSpeed.z * transitionIntensity * 5;
            }
        }
        
        // Apply existing animations based on object type
        switch (obj.userData.type) {
            case 'plant':
                // Sway underwater plants
                obj.rotation.x = Math.sin(timeStep * obj.userData.swaySpeed) * 0.3 * (1 + bassIntensity);
                obj.rotation.z = Math.cos(timeStep * obj.userData.swaySpeed) * 0.3 * (1 + bassIntensity);
                
                // Add a trippy spiral rotation effect
                obj.rotation.y += 0.01 * midIntensity;
                
                // Scale with bass for a pulsing effect
                // Enhance scaling during energy transitions
                const plantScale = 1 + bassIntensity * 0.5 + transitionIntensity * 0.3;
                obj.scale.set(plantScale, plantScale, plantScale);
                break;
                
            case 'fish':
                // Move fish in a swimming pattern
                obj.position.x = obj.userData.originalX + Math.sin(timeStep * obj.userData.swimSpeed) * obj.userData.swimFactor * (1 + bassIntensity * 0.5);
                obj.position.y = obj.userData.originalY + Math.cos(timeStep * obj.userData.swimSpeed * 0.5) * obj.userData.swimFactor * 0.5;
                obj.rotation.y = Math.sin(timeStep * obj.userData.swimSpeed) * 1.2 * (1 + midIntensity * 0.5);
                
                // Add rapid movement during transitions
                if (transitionIntensity > 0.2) {
                    obj.position.x += Math.sin(timeStep * 10) * transitionIntensity * 2;
                    obj.position.y += Math.cos(timeStep * 15) * transitionIntensity;
                }
                
                // Scale based on bass
                obj.scale.set(1 + bassIntensity * 0.4 + transitionIntensity * 0.2, 
                            1 + bassIntensity * 0.4 + transitionIntensity * 0.2, 
                            1 + bassIntensity * 0.4 + transitionIntensity * 0.2);
                
                // Add a wobble effect with treble
                obj.rotation.z = Math.sin(timeStep * 5) * 0.2 * (trebleIntensity + transitionIntensity);
                break;
                
            case 'tree':
                // Pulse trees with mid frequencies
                const treePulse = 1 + midIntensity * obj.userData.pulseFactor * 2 + transitionIntensity * 0.5;
                
                if (obj.userData.originalScale) {
                    obj.scale.set(
                        obj.userData.originalScale.x * treePulse,
                        obj.userData.originalScale.y * (1 + midIntensity * 0.4 + transitionIntensity * 0.3),
                        obj.userData.originalScale.z * treePulse
                    );
                }
                
                // Add a swaying motion
                obj.rotation.z = Math.sin(timeStep * 0.5) * 0.05 * (1 + bassIntensity);
                
                // Add rapid swaying during transitions
                if (transitionIntensity > 0.1) {
                    obj.rotation.z += Math.sin(timeStep * 5) * 0.05 * transitionIntensity;
                }
                
                // Add a spiral growth effect
                obj.rotation.y += 0.005 * midIntensity + 0.01 * transitionIntensity;
                break;
                
            case 'particle':
                // Float forest particles with treble
                obj.position.y = obj.userData.originalY + 
                    Math.sin(timeStep * obj.userData.floatSpeed) * obj.userData.floatFactor * (1 + trebleIntensity * 2);
                
                // Scale with treble and transitions
                const particleScale = 1 + trebleIntensity + transitionIntensity * 0.5;
                obj.scale.set(particleScale, particleScale, particleScale);
                
                // Add some x/z movement too
                obj.position.x += Math.sin(timeStep * 2) * 0.03 * trebleIntensity;
                obj.position.z += Math.cos(timeStep * 3) * 0.03 * trebleIntensity;
                
                // Add rapid movement during transitions
                if (transitionIntensity > 0.1) {
                    obj.position.x += Math.sin(timeStep * 10) * 0.1 * transitionIntensity;
                    obj.position.z += Math.cos(timeStep * 12) * 0.1 * transitionIntensity;
                }
                
                // Add spiral motion
                const spiralRadius = 20 * midIntensity + 40 * transitionIntensity;
                const spiralSpeed = timeStep * (0.2 + transitionIntensity * 0.8);
                obj.position.x += Math.cos(spiralSpeed + obj.userData.floatSpeed) * spiralRadius;
                obj.position.z += Math.sin(spiralSpeed + obj.userData.floatSpeed) * spiralRadius;
                break;
                
            case 'rock':
                // Pulse volcanic rocks with bass
                const rockPulse = 1 + bassIntensity * obj.userData.pulseFactor * 3 + transitionIntensity * 0.8;
                obj.scale.set(rockPulse, rockPulse, rockPulse);
                obj.position.y = obj.userData.originalY + bassIntensity * 3 + transitionIntensity * 5;
                
                // Add a rotation effect
                obj.rotation.y += 0.01 * bassIntensity + 0.03 * transitionIntensity;
                obj.rotation.x += 0.005 * midIntensity + 0.02 * transitionIntensity;
                
                // Add a floating effect with high frequencies
                obj.position.y += Math.sin(timeStep * 2) * (trebleIntensity * 0.5 + transitionIntensity);
                
                // Add horizontal motion during transitions
                if (transitionIntensity > 0.2) {
                    obj.position.x += Math.sin(timeStep * 3) * transitionIntensity * 0.5;
                    obj.position.z += Math.cos(timeStep * 4) * transitionIntensity * 0.5;
                }
                break;
                
            case 'fire':
                // Move fire particles upward and reset their position
                const riseSpeed = obj.userData.riseSpeed * (1 + energyLevel * 2) * (1 + trebleIntensity) * (1 + transitionIntensity);
                obj.position.y += riseSpeed * 0.05;
                
                // Add some horizontal movement
                obj.position.x += Math.sin(timeStep * riseSpeed) * 0.05 * trebleIntensity;
                obj.position.z += Math.cos(timeStep * riseSpeed) * 0.05 * trebleIntensity;
                
                // Scale with treble and transitions
                const fireScale = 1 + trebleIntensity + transitionIntensity * 0.5;
                obj.scale.set(fireScale, fireScale, fireScale);
                
                // Add spiral motion
                const fireSpiral = bassIntensity * 0.5 + transitionIntensity * 0.7;
                obj.position.x += Math.cos(timeStep * 5) * fireSpiral;
                obj.position.z += Math.sin(timeStep * 5) * fireSpiral;
                
                // Reset position when too high
                if (obj.position.y > obj.userData.originalY + obj.userData.riseFactor) {
                    obj.position.y = obj.userData.originalY;
                    obj.position.x = (Math.random() - 0.5) * 50 + obj.userData.originalX;
                    obj.position.z = (Math.random() - 0.5) * 50 + obj.userData.originalZ;
                }
                break;
                
            case 'particles':
                if (!state.psychedelicEffectsEnabled) return;
                
                const positions = obj.geometry.attributes.position.array;
                const colors = obj.geometry.attributes.color.array;
                const sizes = obj.geometry.attributes.size.array;
                const originalPositions = obj.userData.originalPositions;
                const originalSizes = obj.userData.originalSizes;
                
                // Get spectral data for more detailed frequency response
                const spectralData = window.spectralData && state.currentIndex < window.spectralData.length ? 
                    window.spectralData[state.currentIndex] : null;
                
                // Animate particles based on audio
                for (let i = 0; i < positions.length / 3; i++) {
                    // Position distortion based on bass
                    const distortionFactor = bassIntensity * 50 + transitionIntensity * 100;
                    positions[i * 3] = originalPositions[i * 3] + Math.sin(timeStep * 0.5 + i * 0.01) * distortionFactor;
                    positions[i * 3 + 1] = originalPositions[i * 3 + 1] + Math.cos(timeStep * 0.3 + i * 0.01) * distortionFactor;
                    positions[i * 3 + 2] = originalPositions[i * 3 + 2] + Math.sin(timeStep * 0.7 + i * 0.01) * distortionFactor;
                    
                    // Add spiral motion
                    const spiralRadius = 20 * midIntensity + 40 * transitionIntensity;
                    const spiralSpeed = timeStep * (0.2 + transitionIntensity * 0.8);
                    positions[i * 3] += Math.cos(spiralSpeed + i * 0.01) * spiralRadius;
                    positions[i * 3 + 2] += Math.sin(spiralSpeed + i * 0.01) * spiralRadius;
                    
                    // Size pulsing based on treble
                    if (sizes && i < sizes.length) {
                        sizes[i] = originalSizes[i] * (1 + trebleIntensity * 3 + transitionIntensity * 4);
                    }
                    
                    // Color shifting based on mid frequencies
                    const hue = (timeStep * 0.05 + i * 0.001 + transitionIntensity * 0.2) % 1;
                    const color = new THREE.Color().setHSL(
                        hue, 
                        0.8 + midIntensity * 0.2, 
                        0.5 + midIntensity * 0.5 + transitionIntensity * 0.3
                    );
                    colors[i * 3] = color.r;
                    colors[i * 3 + 1] = color.g;
                    colors[i * 3 + 2] = color.b;
                }
                
                // Update the geometry attributes
                obj.geometry.attributes.position.needsUpdate = true;
                obj.geometry.attributes.color.needsUpdate = true;
                if (obj.geometry.attributes.size) {
                    obj.geometry.attributes.size.needsUpdate = true;
                }
                break;
                
            default:
                // Handle new animation types for ad-hoc environment objects
                if (obj.userData.animationType) {
                    switch (obj.userData.animationType) {
                        case 'orbit':
                            // Orbit around a center point
                            if (obj.userData.orbitCenter && obj.userData.orbitRadius) {
                                const orbitSpeed = obj.userData.orbitSpeed * (1 + bassIntensity + midIntensity);
                                const orbitRadius = obj.userData.orbitRadius * (1 + bassIntensity * 0.3);
                                const angle = timeStep * orbitSpeed;
                                
                                // Determine which axis to orbit around
                                switch (obj.userData.orbitAxis) {
                                    case 0: // X-axis
                                        obj.position.y = obj.userData.orbitCenter.y + Math.sin(angle) * orbitRadius;
                                        obj.position.z = obj.userData.orbitCenter.z + Math.cos(angle) * orbitRadius;
                                        break;
                                    case 1: // Y-axis
                                        obj.position.x = obj.userData.orbitCenter.x + Math.sin(angle) * orbitRadius;
                                        obj.position.z = obj.userData.orbitCenter.z + Math.cos(angle) * orbitRadius;
                                        break;
                                    case 2: // Z-axis
                                        obj.position.x = obj.userData.orbitCenter.x + Math.sin(angle) * orbitRadius;
                                        obj.position.y = obj.userData.orbitCenter.y + Math.cos(angle) * orbitRadius;
                                        break;
                                }
                                
                                // Always face the direction of movement
                                obj.lookAt(
                                    obj.position.x + Math.sin(angle + Math.PI/2),
                                    obj.position.y,
                                    obj.position.z + Math.cos(angle + Math.PI/2)
                                );
                                
                                // Add some wobble based on treble
                                obj.rotation.z += Math.sin(timeStep * 5) * 0.1 * trebleIntensity;
                            }
                            break;
                            
                        case 'float':
                            // Floating movement with amplitude affected by audio
                            if (obj.userData.floatAmplitude && obj.userData.floatFrequency) {
                                const floatSpeed = obj.userData.floatFrequency * (1 + midIntensity * 0.5);
                                const floatAmplitude = obj.userData.floatAmplitude * (1 + bassIntensity * 0.5);
                                const phase = obj.userData.floatPhase || 0;
                                
                                // Calculate floating position
                                obj.position.x = obj.userData.originalPosition.x + 
                                    Math.sin(timeStep * floatSpeed + phase) * floatAmplitude * 0.3;
                                obj.position.y = obj.userData.originalPosition.y + 
                                    Math.sin(timeStep * floatSpeed * 0.7 + phase) * floatAmplitude;
                                obj.position.z = obj.userData.originalPosition.z + 
                                    Math.cos(timeStep * floatSpeed * 0.5 + phase) * floatAmplitude * 0.3;
                                
                                // Add gentle rotation
                                obj.rotation.x = Math.sin(timeStep * 0.2 + phase) * 0.1 * (1 + trebleIntensity);
                                obj.rotation.y += 0.005 * (1 + midIntensity * 0.5);
                                obj.rotation.z = Math.cos(timeStep * 0.3 + phase) * 0.1 * (1 + bassIntensity);
                                
                                // Add rapid movement during transitions
                                if (transitionIntensity > 0.2) {
                                    obj.position.x += Math.sin(timeStep * 10) * transitionIntensity;
                                    obj.position.y += Math.cos(timeStep * 12) * transitionIntensity * 1.5;
                                    obj.position.z += Math.sin(timeStep * 8) * transitionIntensity;
                                }
                            }
                            break;
                            
                        case 'pulse':
                            // Pulsing scale with audio reactivity
                            if (obj.userData.pulseMin && obj.userData.pulseMax && obj.userData.pulseFrequency) {
                                const pulseSpeed = obj.userData.pulseFrequency * (1 + bassIntensity * 0.5);
                                const pulseMin = obj.userData.pulseMin;
                                const pulseMax = obj.userData.pulseMax * (1 + bassIntensity * 0.7 + midIntensity * 0.3);
                                
                                // Calculate pulse factor
                                const pulseFactor = pulseMin + (pulseMax - pulseMin) * 
                                    (0.5 + 0.5 * Math.sin(timeStep * pulseSpeed));
                                
                                // Apply scale
                                obj.scale.set(
                                    pulseFactor * obj.userData.originalScale.x,
                                    pulseFactor * obj.userData.originalScale.y,
                                    pulseFactor * obj.userData.originalScale.z
                                );
                                
                                // Add color pulsing if material exists
                                if (obj.material && obj.material.emissiveIntensity !== undefined) {
                                    obj.material.emissiveIntensity = 0.3 + bassIntensity * 0.7 + 
                                        0.3 * Math.sin(timeStep * pulseSpeed * 2);
                                }
                                
                                // Add extra pulse during transitions
                                if (transitionIntensity > 0.2) {
                                    const extraPulse = 1 + transitionIntensity * 0.5;
                                    obj.scale.multiplyScalar(extraPulse);
                                }
                            }
                            break;
                            
                        case 'spin':
                            // Spinning rotation with audio reactivity
                            if (obj.userData.spinAxis !== undefined && obj.userData.spinSpeed) {
                                const spinSpeed = obj.userData.spinSpeed * (1 + midIntensity + trebleIntensity * 0.5);
                                const direction = obj.userData.spinDirection || 1;
                                
                                // Apply rotation based on spin axis
                                switch (obj.userData.spinAxis) {
                                    case 0: // X-axis
                                        obj.rotation.x += timeStep * spinSpeed * direction;
                                        break;
                                    case 1: // Y-axis
                                        obj.rotation.y += timeStep * spinSpeed * direction;
                                        break;
                                    case 2: // Z-axis
                                        obj.rotation.z += timeStep * spinSpeed * direction;
                                        break;
                                }
                                
                                // Add wobble on other axes
                                if (obj.userData.spinAxis !== 0) {
                                    obj.rotation.x += Math.sin(timeStep) * 0.02 * bassIntensity;
                                }
                                if (obj.userData.spinAxis !== 1) {
                                    obj.rotation.y += Math.cos(timeStep * 0.7) * 0.02 * midIntensity;
                                }
                                if (obj.userData.spinAxis !== 2) {
                                    obj.rotation.z += Math.sin(timeStep * 1.3) * 0.02 * trebleIntensity;
                                }
                                
                                // Add rapid spin during transitions
                                if (transitionIntensity > 0.2) {
                                    obj.rotation.x += direction * transitionIntensity * 0.1;
                                    obj.rotation.y += direction * transitionIntensity * 0.15;
                                    obj.rotation.z += direction * transitionIntensity * 0.1;
                                }
                            }
                            break;
                    }
                    
                    // Apply color effects to all ad-hoc objects if they have materials
                    if (state.psychedelicEffectsEnabled && obj.material) {
                        // Apply color effects based on audio
                        if (obj.material.color) {
                            // Get base color from zone palette
                            let baseColor;
                            if (obj.userData.type && obj.userData.type.endsWith('Object')) {
                                const zoneName = obj.userData.type.replace('Object', '');
                                const zoneKey = zoneName + 'Zone';
                                if (window.colors && window.colors[zoneKey]) {
                                    baseColor = new THREE.Color(window.colors[zoneKey].main);
                                }
                            }
                            
                            if (!baseColor) {
                                baseColor = new THREE.Color(0xffffff);
                            }
                            
                            // Apply audio-reactive color shifts
                            const hsl = {};
                            baseColor.getHSL(hsl);
                            
                            // Shift hue based on audio and time
                            hsl.h = (hsl.h + timeStep * 0.05 * midIntensity + bassIntensity * 0.1) % 1.0;
                            
                            // Increase saturation with mid frequencies
                            hsl.s = Math.min(1.0, hsl.s + midIntensity * 0.3);
                            
                            // Increase lightness with treble
                            hsl.l = Math.min(1.0, hsl.l + trebleIntensity * 0.2);
                            
                            // Apply color
                            obj.material.color.setHSL(hsl.h, hsl.s, hsl.l);
                            
                            // Apply emissive color if available
                            if (obj.material.emissive) {
                                obj.material.emissive.setHSL(
                                    (hsl.h + 0.5) % 1.0, // Complementary color
                                    hsl.s,
                                    Math.min(0.5, bassIntensity * 0.5 + midIntensity * 0.3)
                                );
                            }
                        }
                    }
                }
                break;
        }
    });
}

// Toggle psychedelic effects
export function togglePsychedelicEffects() {
    state.psychedelicEffectsEnabled = !state.psychedelicEffectsEnabled;
    console.log(`Psychedelic effects: ${state.psychedelicEffectsEnabled ? 'Enabled' : 'Disabled'}`);
    
    // Button no longer exists, so we just log the state change
} 