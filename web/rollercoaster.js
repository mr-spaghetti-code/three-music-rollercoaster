// Rollercoaster creation and path management

import * as THREE from 'three';

// Rollercoaster variables
let rollercoaster, rollercoasterPath;
let lightOrbs = [];
let lightOrbsGroup;

// Create the rollercoaster based on energy data
export function createRollercoaster(scene, energyData, structureData, envMap) {
    // Create a path for the rollercoaster
    const points = [];
    
    // Check if we have valid energy data
    if (!energyData || energyData.length === 0) {
        console.error("No energy data available to create rollercoaster");
        return null;
    }
    
    console.log(`Creating rollercoaster with ${energyData.length} energy data points`);
    console.log("Sample energy data:", 
               energyData[0], 
               energyData[Math.floor(energyData.length/2)], 
               energyData[energyData.length-1]);
    
    // Check if energy field exists
    let energyField = 'energy';
    if (energyData[0] && typeof energyData[0].energy !== 'number') {
        console.warn("Energy field not found in data, looking for alternative fields");
        // Find a numeric field to use as energy
        const sampleKeys = Object.keys(energyData[0]);
        for (const key of sampleKeys) {
            if (typeof energyData[0][key] === 'number' && key !== 'time') {
                energyField = key;
                console.log(`Using ${energyField} as energy field`);
                break;
            }
        }
    }
    
    // Calculate energy derivatives for detecting transitions
    const energyDerivatives = [];
    for (let i = 1; i < energyData.length; i++) {
        if (energyData[i] && energyData[i-1] && 
            typeof energyData[i][energyField] === 'number' && 
            typeof energyData[i-1][energyField] === 'number') {
            energyDerivatives.push(energyData[i][energyField] - energyData[i-1][energyField]);
        } else {
            energyDerivatives.push(0);
        }
    }
    energyDerivatives.unshift(0); // Add a 0 at the beginning to match length
    
    // Use energy data to create a path
    for (let i = 0; i < energyData.length; i += 5) { // Sample more frequently for smoother path
        // Ensure we have valid energy data at this index
        if (!energyData[i] || typeof energyData[i][energyField] !== 'number') {
            console.warn(`Invalid energy data at index ${i}, skipping point`);
            continue;
        }
        
        const energy = energyData[i][energyField];
        // Safely access structure data
        const structure = (structureData[i] && typeof structureData[i].structure === 'number') 
            ? structureData[i].structure 
            : 0;
        
        // Enhanced height scaling - make the height differences more dramatic
        // Increase height scale for more dramatic ups and downs
        const heightScale = 150; // Increased from 100 for more dramatic height changes
        const heightExponent = 3.0; // Increased from 2.5 for more dramatic differences
        
        // Calculate the base height from energy level
        const baseHeight = Math.pow(Math.max(0, energy), heightExponent) * heightScale;
        
        // Get energy change rate (derivative) for this point
        const energyChangeRate = Math.abs(energyDerivatives[i]);
        
        // Amplify height changes when energy is changing rapidly (add hills/valleys during transitions)
        const transitionBoost = energyChangeRate * 100; // Add extra height during transitions
        
        // Final height combines base energy height with transition emphasis
        const height = baseHeight + transitionBoost;
        
        // Use structure data to add variation to the path
        const structureVariation = structure * 30; // Increased from 20
        
        // Calculate position - using a tighter spiral pattern for more exciting curves
        const t = i / energyData.length;
        
        // Increase the number of spiral turns for more excitement
        const spiralTurns = 5; // Increased from 3
        const angle = t * Math.PI * 2 * spiralTurns;
        
        // Make the spiral tighter for a more exciting ride
        const baseRadius = 80; // Decreased from 100 for tighter turns
        const expansionFactor = 200; // Increased from 150 for more expansion
        const radius = baseRadius + t * expansionFactor + structureVariation;
        
        // Add horizontal variation based on structure data and energy change rate
        // Increase variations during energy transitions
        const horizontalVariation = Math.sin(t * Math.PI * 15) * 25 * (structure + energyChangeRate * 2);
        
        const x = Math.cos(angle) * (radius + horizontalVariation);
        const y = height;
        const z = Math.sin(angle) * (radius + horizontalVariation);
        
        points.push(new THREE.Vector3(x, y, z));
    }
    
    // Ensure we have enough points to create a curve
    if (points.length < 4) {
        console.error(`Not enough valid points to create rollercoaster: ${points.length} points`);
        // Create a simple spiral path as fallback
        for (let i = 0; i < 36; i++) {
            const t = i / 36;
            const angle = t * Math.PI * 2 * 3; // 3 complete turns
            const radius = 100 + t * 150; // Expanding radius
            const x = Math.cos(angle) * radius;
            const y = 20 + Math.sin(t * Math.PI * 4) * 30; // Some height variation
            const z = Math.sin(angle) * radius;
            points.push(new THREE.Vector3(x, y, z));
        }
    }
    
    console.log(`Created rollercoaster path with ${points.length} points`);
    
    // Create a smooth curve from the points
    rollercoasterPath = new THREE.CatmullRomCurve3(points);
    
    try {
        // Create a tube geometry from the curve
        const tubeGeometry = new THREE.TubeGeometry(
            rollercoasterPath,
            Math.min(points.length * 3, 800), // Increased segments for smoother curve
            2, // Tube radius
            12, // Increased tube segments from 8 to 12 for smoother tube
            false // Closed
        );
        
        // Create a custom shader material for rainbow effect
        const rainbowUniforms = {
            time: { value: 0 },
            speed: { value: 0.2 },
            colorDensity: { value: 2.0 },
            colorSpeed: { value: 0.8 },
            colorShift: { value: 0.0 },
            metalness: { value: 0.9 },
            roughness: { value: 0.1 },
            envMap: { value: envMap }
        };
        
        // Vertex shader for the tube
        const tubeVertexShader = `
            varying vec2 vUv;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
                vUv = uv;
                vPosition = position;
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
        
        // Fragment shader for rainbow effect
        const tubeFragmentShader = `
            uniform float time;
            uniform float speed;
            uniform float colorDensity;
            uniform float colorSpeed;
            uniform float colorShift;
            uniform float metalness;
            uniform float roughness;
            uniform samplerCube envMap;
            
            varying vec2 vUv;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            // Function to convert HSV to RGB
            vec3 hsv2rgb(vec3 c) {
                vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
            }
            
            void main() {
                // Calculate position along the tube (0-1)
                float positionAlongTube = vUv.x;
                
                // Create a flowing rainbow effect
                float hue = fract(positionAlongTube * colorDensity + time * colorSpeed + colorShift);
                float saturation = 0.8;
                float value = 0.9;
                
                // Convert HSV to RGB
                vec3 rainbowColor = hsv2rgb(vec3(hue, saturation, value));
                
                // Add some variation based on normal direction
                float normalFactor = dot(vNormal, vec3(0.0, 1.0, 0.0)) * 0.2 + 0.8;
                rainbowColor *= normalFactor;
                
                // Add some sparkle effect
                float sparkle = pow(max(0.0, dot(vNormal, normalize(vec3(1.0, 1.0, 1.0)))), 20.0) * 0.5;
                
                // Final color with sparkle
                vec3 finalColor = rainbowColor + vec3(sparkle);
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;
        
        // Create the shader material
        const tubeMaterial = new THREE.ShaderMaterial({
            uniforms: rainbowUniforms,
            vertexShader: tubeVertexShader,
            fragmentShader: tubeFragmentShader,
            side: THREE.DoubleSide
        });
        
        // Create the tube mesh
        rollercoaster = new THREE.Mesh(tubeGeometry, tubeMaterial);
        rollercoaster.castShadow = true;
        rollercoaster.receiveShadow = true;
        
        // Store the uniforms for animation
        rollercoaster.userData = {
            uniforms: rainbowUniforms,
            type: 'rainbowTube'
        };
        
        scene.add(rollercoaster);
        
        // Add track supports - but only add them every 15 points to reduce clutter
        // Use a mix of vertical and diagonal supports
        for (let i = 0; i < points.length; i += 15) {
            // Skip some supports randomly to reduce clutter
            if (Math.random() < 0.3) continue;
            
            if (i % 30 === 0 && i + 5 < points.length) {
                // Add diagonal support connecting to a point ahead
                addDiagonalSupport(scene, points[i], points[i + 5], envMap);
            } else {
                // Add regular vertical support
                addTrackSupport(scene, points[i], envMap);
            }
        }
        
        console.log("Rollercoaster created with", points.length, "points");
        
        // Add to animated objects if there's a global array
        if (window.animatedObjects) {
            window.animatedObjects.push(rollercoaster);
        }
        
        return { rollercoaster, rollercoasterPath };
    } catch (error) {
        console.error("Error creating rollercoaster geometry:", error);
        // Create a simple fallback object
        const fallbackGeometry = new THREE.TorusGeometry(100, 3, 16, 100);
        const fallbackMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            metalness: 0.9,
            roughness: 0.1,
            envMap: envMap
        });
        rollercoaster = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
        scene.add(rollercoaster);
        
        // Create a simple path for camera movement
        const circlePoints = [];
        for (let i = 0; i < 100; i++) {
            const t = i / 100;
            const angle = t * Math.PI * 2;
            circlePoints.push(new THREE.Vector3(
                Math.cos(angle) * 100,
                20,
                Math.sin(angle) * 100
            ));
        }
        rollercoasterPath = new THREE.CatmullRomCurve3(circlePoints);
        
        console.error("Created fallback rollercoaster due to error");
        
        return { rollercoaster, rollercoasterPath };
    }
}

function addTrackSupport(scene, position, envMap) {
    // Validate position
    if (!position || typeof position.y !== 'number' || typeof position.x !== 'number' || typeof position.z !== 'number') {
        console.warn("Invalid position for track support, skipping");
        return;
    }
    
    // Skip supports for very high track sections to reduce visual clutter
    if (position.y > 150) {
        return;
    }
    
    // Ensure height is positive
    const height = Math.max(0.1, position.y);
    
    try {
        // Make supports thinner
        const supportGeometry = new THREE.CylinderGeometry(0.3, 0.3, height, 6);
        const supportMaterial = new THREE.MeshStandardMaterial({
            color: 0x777777,  // Lighter color to stand out more
            metalness: 0.7,   // Increased from 0.5
            roughness: 0.3,   // Decreased from 0.5
            envMap: envMap,   // Add environment map
            transparent: true,
            opacity: 0.8,     // Less transparent than before
            emissive: 0x222222, // Slight emissive glow to stand out in fog
            emissiveIntensity: 0.2
        });
        
        const support = new THREE.Mesh(supportGeometry, supportMaterial);
        support.position.set(position.x, height / 2, position.z);
        support.castShadow = true;
        support.receiveShadow = true;
        scene.add(support);
        return support;
    } catch (error) {
        console.error("Error creating track support:", error);
        return null;
    }
}

function addDiagonalSupport(scene, trackPoint, nextPoint, envMap) {
    // Validate positions
    if (!trackPoint || !nextPoint || 
        typeof trackPoint.y !== 'number' || typeof nextPoint.y !== 'number') {
        return null;
    }
    
    // Skip supports for very high track sections
    if (trackPoint.y > 150 || nextPoint.y > 150) {
        return null;
    }
    
    try {
        // Create a ground point directly below the track point
        const groundPoint = new THREE.Vector3(trackPoint.x, -5, trackPoint.z);
        
        // Create a direction vector from ground to next track point
        const direction = new THREE.Vector3().subVectors(nextPoint, groundPoint);
        const distance = direction.length();
        direction.normalize();
        
        // Create a cylinder geometry for the diagonal support
        // The cylinder is created along the y-axis, so we need to apply a rotation
        const supportGeometry = new THREE.CylinderGeometry(0.2, 0.2, distance, 6);
        const supportMaterial = new THREE.MeshStandardMaterial({
            color: 0x777777,  // Lighter color
            metalness: 0.7,   // More metallic
            roughness: 0.3,   // Less rough
            envMap: envMap,   // Add environment map
            transparent: true,
            opacity: 0.8,     // Less transparent
            emissive: 0x222222, // Slight emissive glow
            emissiveIntensity: 0.2
        });
        
        const support = new THREE.Mesh(supportGeometry, supportMaterial);
        
        // Position the support at the midpoint between ground and next point
        const midpoint = new THREE.Vector3().addVectors(groundPoint, nextPoint).multiplyScalar(0.5);
        support.position.copy(midpoint);
        
        // Orient the support to point from ground to next point
        // First, create a quaternion that rotates from the cylinder's default orientation (along y-axis)
        // to the direction we want
        const yAxis = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(yAxis, direction);
        support.setRotationFromQuaternion(quaternion);
        
        scene.add(support);
        return support;
    } catch (error) {
        console.error("Error creating diagonal support:", error);
        return null;
    }
}

// Get the rollercoaster
export function getRollercoaster() {
    return rollercoaster;
}

// Get the rollercoaster path
export function getRollercoasterPath() {
    return rollercoasterPath;
}

// Create light orbs that travel through the rollercoaster tube
export function createLightOrbs(scene, count = 15) { // Reduced from 50 to 15
    // Remove existing orbs if any
    if (lightOrbsGroup) {
        scene.remove(lightOrbsGroup);
    }
    
    // Create a new group to hold all light orbs
    lightOrbsGroup = new THREE.Group();
    lightOrbs = [];
    
    // Create orbs with different colors
    const orbColors = [
        0x4fc3f7, // Light blue
        0x64ffda, // Teal
        0xb39ddb, // Purple
        0xffeb3b, // Yellow
        0xff8a65  // Orange
    ];
    
    for (let i = 0; i < count; i++) {
        // Create a small glowing sphere with emissive material instead of actual lights
        const orbGeometry = new THREE.SphereGeometry(0.5, 8, 8); // Simplified geometry
        const orbMaterial = new THREE.MeshStandardMaterial({
            color: orbColors[i % orbColors.length],
            emissive: orbColors[i % orbColors.length],
            emissiveIntensity: 2.0,
            transparent: true,
            opacity: 0.9
        });
        const orb = new THREE.Mesh(orbGeometry, orbMaterial);
        
        // Set initial position along the track
        // Space orbs evenly along the track
        const initialPosition = i / count;
        
        // Add to our collections
        orb.userData = {
            position: initialPosition,
            speed: 0.0002 + Math.random() * 0.0004, // Slightly different speeds
            originalColor: new THREE.Color(orbColors[i % orbColors.length]),
            originalIntensity: 2.0
        };
        
        lightOrbs.push(orb);
        lightOrbsGroup.add(orb);
    }
    
    scene.add(lightOrbsGroup);
    console.log(`Created ${count} light orbs for the rollercoaster`);
    
    return lightOrbs;
}

// Update light orbs position and appearance based on music
export function updateLightOrbs(audioData) {
    if (!rollercoasterPath || !lightOrbs.length) return;
    
    lightOrbs.forEach(orb => {
        // Move the orb along the path
        orb.userData.position += orb.userData.speed;
        if (orb.userData.position > 1) {
            orb.userData.position = 0;
        }
        
        // Get position on the rollercoaster path
        const point = rollercoasterPath.getPointAt(orb.userData.position);
        if (point) {
            orb.position.copy(point);
            
            // Get the next point to orient the orb
            const lookAhead = Math.min(orb.userData.position + 0.01, 0.99);
            const pointAhead = rollercoasterPath.getPointAt(lookAhead);
            if (pointAhead) {
                orb.lookAt(pointAhead);
            }
        }
        
        // Update orb appearance based on audio
        if (audioData) {
            // Find frequency bands that affect this orb
            const frequencyBand = Math.floor((orb.userData.position * 31) % 32);
            const intensity = audioData.fullSpectrum[frequencyBand] / 255;
            
            // Calculate color based on audio intensity
            const color = orb.userData.originalColor.clone();
            
            // Make the orb brighter based on audio intensity
            const intensityFactor = 1 + intensity * 2;
            color.r *= intensityFactor;
            color.g *= intensityFactor;
            color.b *= intensityFactor;
            
            // Update material color and emissive color
            orb.material.color.copy(color);
            orb.material.emissive.copy(color);
            
            // Update emissive intensity
            orb.material.emissiveIntensity = orb.userData.originalIntensity * (1 + intensity * 2);
            
            // Scale orb based on intensity
            const scale = 1 + intensity * 0.5;
            orb.scale.set(scale, scale, scale);
        }
    });
} 