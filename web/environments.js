// Environment creation and management

import * as THREE from 'three';
import { colors, config, zonePalettes, getAllZoneNames } from './config.js';

// Initialize environment objects with dynamic zone keys
let environmentObjects = {};

// Initialize environment objects for all zones
function initializeEnvironmentObjects() {
    // Get all zone names and create empty arrays for each
    getAllZoneNames().forEach(zoneName => {
        environmentObjects[zoneName + 'Zone'] = [];
    });
    return environmentObjects;
}

// Initialize environment objects
environmentObjects = initializeEnvironmentObjects();

let animatedObjects = [];
let allObjects = [];
let envMap; // Environment map for reflections

// Create all environments
export function createEnvironments(scene) {
    // Create psychedelic ground plane with shader material
    // Replace rectangular plane with circular plane matching the sphere radius
    const groundGeometry = new THREE.CircleGeometry(470, 128); // Slightly larger than sky sphere (450) to ensure overlap
    
    // Ground shader uniforms
    const groundUniforms = {
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        bassIntensity: { value: 0.0 },
        midIntensity: { value: 0.0 },
        trebleIntensity: { value: 0.0 },
        colorShift: { value: 0.0 },
        zoneColor: { value: new THREE.Color(0x1a237e) } // Default to low energy zone color
    };
    
    // Vertex shader for animated ground
    const groundVertexShader = `
        uniform float time;
        uniform float bassIntensity;
        uniform float midIntensity;
        
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
            vUv = uv;
            vPosition = position;
            
            // Create wave effect based on audio
            float waveX = sin(position.x * 0.05 + time * 0.5) * bassIntensity * 5.0;
            float waveZ = cos(position.y * 0.05 + time * 0.3) * midIntensity * 5.0;
            
            // Apply wave displacement to vertex
            vec3 newPosition = position;
            newPosition.z += waveX + waveZ;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
    `;
    
    // Fragment shader for psychedelic ground
    const groundFragmentShader = `
        uniform float time;
        uniform vec2 resolution;
        uniform float bassIntensity;
        uniform float midIntensity;
        uniform float trebleIntensity;
        uniform float colorShift;
        uniform vec3 zoneColor;
        
        varying vec2 vUv;
        varying vec3 vPosition;
        
        // Simplex noise function
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
        
        float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
            
            // First corner
            vec3 i  = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);
            
            // Other corners
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);
            
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            
            // Permutations
            i = mod289(i);
            vec4 p = permute(permute(permute(
                     i.z + vec4(0.0, i1.z, i2.z, 1.0))
                   + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                   + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                   
            // Gradients
            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;
            
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);
            
            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            
            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);
            
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            
            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
            
            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);
            
            // Normalise gradients
            vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;
            
            // Mix final noise value
            vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
        }
        
        void main() {
            // Scale UVs for better pattern size
            vec2 uv = vUv * 10.0;
            
            // Create psychedelic patterns using noise
            float noiseScale = 1.0 + bassIntensity * 2.0;
            float noiseSpeed = time * (0.1 + midIntensity * 0.3);
            
            // Multiple layers of noise for more complex patterns
            float noise1 = snoise(vec3(uv * noiseScale, noiseSpeed * 0.5)) * 0.5 + 0.5;
            float noise2 = snoise(vec3(uv * noiseScale * 2.0, noiseSpeed * 0.7 + 100.0)) * 0.5 + 0.5;
            
            // Combine noise layers
            float combinedNoise = (noise1 * 0.6 + noise2 * 0.4);
            
            // Create color patterns
            float hue = colorShift + combinedNoise * 0.2;
            float saturation = 0.5 + midIntensity * 0.5;
            float brightness = 0.3 + trebleIntensity * 0.5;
            
            // Convert HSV to RGB
            vec3 noiseColor = vec3(0.0);
            
            // HSV to RGB conversion
            float h = mod(hue * 6.0, 6.0);
            float f = fract(h);
            float p = brightness * (1.0 - saturation);
            float q = brightness * (1.0 - f * saturation);
            float t = brightness * (1.0 - (1.0 - f) * saturation);

            if (h < 1.0) noiseColor = vec3(brightness, t, p);
            else if (h < 2.0) noiseColor = vec3(q, brightness, p);
            else if (h < 3.0) noiseColor = vec3(p, brightness, t);
            else if (h < 4.0) noiseColor = vec3(p, q, brightness);
            else if (h < 5.0) noiseColor = vec3(t, p, brightness);
            else noiseColor = vec3(brightness, p, q);
            
            // Blend with zone color
            vec3 rgb = mix(zoneColor, noiseColor, 0.7);
            
            // Add grid pattern
            float gridX = abs(fract(uv.x * 0.5) - 0.5);
            float gridY = abs(fract(uv.y * 0.5) - 0.5);
            float grid = max(1.0 - gridX * 20.0, 1.0 - gridY * 20.0);
            grid = smoothstep(0.0, 0.2, grid) * bassIntensity;
            
            // Add grid lines
            rgb += vec3(grid) * 0.3;
            
            // Add distance fade for depth
            float distanceFromCenter = length(vUv - 0.5) * 2.0;
            float fade = 1.0 - smoothstep(0.0, 1.0, distanceFromCenter);
            
            // Final color with fade
            gl_FragColor = vec4(rgb, 1.0);
        }
    `;
    
    // Create shader material
    const groundMaterial = new THREE.ShaderMaterial({
        uniforms: groundUniforms,
        vertexShader: groundVertexShader,
        fragmentShader: groundFragmentShader,
        side: THREE.DoubleSide
    });
    
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -4.5; // Adjusted position to better connect with the sky sphere
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Store ground uniforms for animation updates
    ground.userData = {
        uniforms: groundUniforms,
        type: 'psychedelicGround'
    };
    
    // Add to animated objects
    animatedObjects.push(ground);
    
    // Create environment for each zone
    // Get all zone names
    const zoneNames = getAllZoneNames();
    console.log("Creating environments for zones:", zoneNames);
    
    // Create ad-hoc environments for all zones
    zoneNames.forEach(zoneName => {
        createAdHocEnvironment(scene, zoneName);
    });
    
    // Create additional shared geometric objects
    createSharedGeometricObjects(scene, 300); // Increased count for more objects
    
    // Initially hide all zones except the default one
    toggleZoneVisibility('low');
    
    console.log("Environments created successfully");
    
    return { environmentObjects, animatedObjects, allObjects };
}

// Toggle zone visibility
export function toggleZoneVisibility(zone) {
    console.log(`Toggling visibility for zone: ${zone} (type: ${typeof zone})`);
    
    // Convert zone to string name format (e.g., 'low' to 'lowZone')
    let zoneKey;
    if (typeof zone === 'number') {
        // Get zone name from the zonePalettes using the index
        const zoneName = Object.values(zonePalettes)[zone]?.name || 'low';
        zoneKey = zoneName + 'Zone';
    } else {
        // Convert to string name format (e.g., 'low' to 'lowZone')
        zoneKey = zone + 'Zone';
    }
    
    console.log(`Using zone key: ${zoneKey}`);
    
    // Hide all zone objects
    Object.keys(environmentObjects).forEach(key => {
        environmentObjects[key].forEach(obj => {
            obj.visible = false;
        });
    });
    
    // Show objects for the current zone
    if (environmentObjects[zoneKey]) {
        environmentObjects[zoneKey].forEach(obj => {
            obj.visible = true;
        });
    } else {
        console.error(`Zone key ${zoneKey} not found in environmentObjects`);
    }
    
    // Get the zone color based on zoneKey
    const zoneColors = colors[zoneKey];
    if (!zoneColors) {
        console.error(`No colors found for zone key ${zoneKey}`);
        return;
    }
    
    // Get fog color from the zone palette
    const fogColor = new THREE.Color(zoneColors.fogColor || 0x000000);
    
    // Update scene (must be done in main.js since scene is not available here)
    const updateEvent = new CustomEvent('zoneChange', {
        detail: {
            fogColor: fogColor,
            ambientColor: zoneColors.ambient,
            zoneColor: zoneColors.main
        }
    });
    
    window.dispatchEvent(updateEvent);
    
    console.log(`Switched to zone: ${zone} (key: ${zoneKey})`);
}

// Create environment map for reflections
export function createEnvironmentMap(renderer, scene) {
    // Create a cube camera for real-time environment mapping
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
        format: THREE.RGBFormat, 
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter
    });
    
    // Use a dummy cube render target for now
    // In a more advanced version, you could update this in real-time
    const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
    scene.add(cubeCamera);
    
    // Create a fallback HDR environment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    
    // Create a simple gradient environment
    const envScene = new THREE.Scene();
    
    // Create a gradient background
    const bgColors = [
        new THREE.Color(0x000000), // Bottom
        new THREE.Color(0x0a1030), // Middle
        new THREE.Color(0x1a2056)  // Top
    ];
    
    const positions = [
        -1, // Bottom
        0,  // Middle
        1   // Top
    ];
    
    // Create a sky box with gradient
    const skyGeo = new THREE.SphereGeometry(500, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: bgColors[2] },
            midColor: { value: bgColors[1] },
            bottomColor: { value: bgColors[0] },
            offset: { value: positions }
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 midColor;
            uniform vec3 bottomColor;
            uniform float offset[3];
            varying vec3 vWorldPosition;
            void main() {
                float h = normalize(vWorldPosition).y;
                vec3 color;
                if (h <= offset[1]) {
                    // Blend between bottom and middle
                    float t = (h - offset[0]) / (offset[1] - offset[0]);
                    color = mix(bottomColor, midColor, t);
                } else {
                    // Blend between middle and top
                    float t = (h - offset[1]) / (offset[2] - offset[1]);
                    color = mix(midColor, topColor, t);
                }
                gl_FragColor = vec4(color, 1.0);
            }
        `,
        side: THREE.BackSide
    });
    
    const sky = new THREE.Mesh(skyGeo, skyMat);
    envScene.add(sky);
    
    // Generate the PMREM from this scene
    const pmremMap = pmremGenerator.fromScene(envScene);
    envMap = pmremMap.texture;
    
    console.log("Environment map created");
    
    return envMap;
}

// Setup lighting in the scene
export function setupLighting(scene) {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.7); // Increased intensity from 0.5 to 0.7
    scene.add(ambientLight);
    
    // Directional light (sun)
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2); // Increased intensity from 1.0 to 1.2
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    scene.add(sunLight);
    
    // Add some point lights for more interesting lighting
    const colors = [0xff0066, 0x00ffff, 0xffff00];
    const positions = [
        [20, 30, 20],
        [-20, 40, -20],
        [0, 20, 50]
    ];
    
    positions.forEach((pos, i) => {
        const light = new THREE.PointLight(colors[i], 1.5, 100);
        light.position.set(pos[0], pos[1], pos[2]);
        scene.add(light);
    });
}

// Create a particle system for psychedelic effects
export function createParticleSystem(scene) {
    // Create particle geometry
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(config.particleCount * 3);
    const colors = new Float32Array(config.particleCount * 3);
    const sizes = new Float32Array(config.particleCount);
    
    // Initialize particles with random positions in a sphere around the camera path
    const radius = 500;
    const color = new THREE.Color();
    
    for (let i = 0; i < config.particleCount; i++) {
        // Random position in a sphere
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = radius * Math.cbrt(Math.random()); // Cube root for uniform distribution
        
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
        
        // Random color
        color.setHSL(Math.random(), 0.8, 0.5);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
        
        // Random size
        sizes[i] = 2 + Math.random() * 5;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    // Create a circular particle texture
    const particleTexture = createCircleTexture();
    
    // Create particle material with the circular texture
    const particleMaterial = new THREE.PointsMaterial({
        size: 1,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        depthWrite: false,
        map: particleTexture
    });
    
    // Create particle system
    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    particleSystem.userData = {
        type: 'particles',
        originalPositions: positions.slice(),
        originalSizes: sizes.slice()
    };
    
    scene.add(particleSystem);
    animatedObjects.push(particleSystem);
    console.log("Particle system created with", config.particleCount, "particles");
    
    return particleSystem;
}

// Create a circular texture for particles
function createCircleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    
    const context = canvas.getContext('2d');
    context.beginPath();
    context.arc(32, 32, 28, 0, Math.PI * 2);
    
    // Create a radial gradient for a glowing effect
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.6)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    context.fillStyle = gradient;
    context.fill();
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

// Get the environment objects
export function getEnvironmentObjects() {
    return environmentObjects;
}

// Get the animated objects
export function getAnimatedObjects() {
    return animatedObjects;
}

// Get all objects
export function getAllObjects() {
    return allObjects;
}

// Create a generic environment for additional zones
function createGenericEnvironment(scene, zoneName) {
    console.log(`Creating generic environment for zone: ${zoneName}`);
    
    const zoneKey = zoneName + 'Zone';
    const palette = colors[zoneKey];
    
    if (!palette) {
        console.error(`No color palette found for zone: ${zoneName}`);
        return;
    }
    
    // Create some basic objects for this zone
    const objectCount = 200;
    for (let i = 0; i < objectCount; i++) {
        // Create a random geometric object
        const geometryType = Math.floor(Math.random() * 5);
        let geometry;
        
        switch (geometryType) {
            case 0:
                geometry = new THREE.SphereGeometry(1 + Math.random() * 3, 16, 16);
                break;
            case 1:
                geometry = new THREE.BoxGeometry(1 + Math.random() * 3, 1 + Math.random() * 3, 1 + Math.random() * 3);
                break;
            case 2:
                geometry = new THREE.ConeGeometry(1 + Math.random() * 2, 2 + Math.random() * 4, 8);
                break;
            case 3:
                geometry = new THREE.CylinderGeometry(0.5 + Math.random(), 0.5 + Math.random(), 2 + Math.random() * 4, 8);
                break;
            case 4:
                geometry = new THREE.TorusGeometry(1 + Math.random() * 2, 0.3 + Math.random() * 0.5, 16, 32);
                break;
        }
        
        // Create material with zone colors
        const material = new THREE.MeshPhysicalMaterial({
            color: palette.main,
            emissive: palette.emissive,
            emissiveIntensity: 0.3,
            roughness: 0.4,
            metalness: 0.6,
            clearcoat: 0.5,
            clearcoatRoughness: 0.2,
            envMap: envMap,
            reflectivity: 0.8
        });
        
        const object = new THREE.Mesh(geometry, material);
        
        // Position randomly
        const x = (Math.random() - 0.5) * 400;
        const y = Math.random() * 50;
        const z = -Math.random() * 4000;
        object.position.set(x, y, z);
        
        // Random rotation
        object.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        
        // Add animation data
        object.userData = {
            originalPosition: new THREE.Vector3(x, y, z),
            pulseFactor: 0.1 + Math.random() * 0.2,
            pulseSpeed: 0.3 + Math.random() * 0.7,
            type: zoneName + 'Object',
            lastRepositionTime: 0
        };
        
        scene.add(object);
        environmentObjects[zoneKey].push(object);
        animatedObjects.push(object);
        allObjects.push(object);
    }
    
    console.log(`Created ${objectCount} objects for zone: ${zoneName}`);
}

// Create an ad-hoc environment for a zone
function createAdHocEnvironment(scene, zoneName) {
    console.log(`Creating ad-hoc environment for zone: ${zoneName}`);
    
    const zoneKey = zoneName + 'Zone';
    const palette = colors[zoneKey];
    
    if (!palette) {
        console.error(`No color palette found for zone: ${zoneName}`);
        return;
    }
    
    // Create more objects for a richer environment
    const objectCount = 400; // Doubled from 200
    
    // Create a variety of objects with different properties
    for (let i = 0; i < objectCount; i++) {
        // Create a random geometric object with more variety
        const geometryType = Math.floor(Math.random() * 10); // Increased variety
        let geometry;
        
        switch (geometryType) {
            case 0:
                // More detailed spheres with varying segment counts
                const sphereDetail = Math.floor(4 + Math.random() * 28); // 4-32 segments
                geometry = new THREE.SphereGeometry(1 + Math.random() * 3, sphereDetail, sphereDetail);
                break;
            case 1:
                // Boxes with non-uniform dimensions
                geometry = new THREE.BoxGeometry(
                    0.5 + Math.random() * 4, 
                    0.5 + Math.random() * 4, 
                    0.5 + Math.random() * 4
                );
                break;
            case 2:
                // Cones with varying radial segments
                const coneSegments = Math.floor(3 + Math.random() * 13); // 3-16 segments
                geometry = new THREE.ConeGeometry(
                    0.5 + Math.random() * 3, // radius
                    1 + Math.random() * 5,   // height
                    coneSegments,            // radial segments
                    1,                       // height segments
                    Math.random() < 0.3      // 30% chance for open-ended cones
                );
                break;
            case 3:
                // Cylinders with varying segment counts and potentially different top/bottom radii
                const cylinderSegments = Math.floor(4 + Math.random() * 12); // 4-16 segments
                const topRadius = 0.3 + Math.random() * 2;
                // 50% chance for different top/bottom radii (like truncated cones)
                const bottomRadius = Math.random() < 0.5 ? topRadius : 0.3 + Math.random() * 2;
                geometry = new THREE.CylinderGeometry(
                    topRadius,
                    bottomRadius,
                    1 + Math.random() * 5,   // height
                    cylinderSegments,        // radial segments
                    Math.floor(1 + Math.random() * 3), // height segments
                    Math.random() < 0.2      // 20% chance for open-ended cylinders
                );
                break;
            case 4:
                // Torus with varying segment counts
                const torusDetail = Math.floor(8 + Math.random() * 24); // 8-32 segments
                geometry = new THREE.TorusGeometry(
                    1 + Math.random() * 2,   // radius
                    0.2 + Math.random() * 0.8, // tube radius
                    torusDetail,             // radial segments
                    Math.floor(6 + Math.random() * 26) // tubular segments (6-32)
                );
                break;
            case 5:
                // TorusKnot with varying parameters
                const p = Math.floor(2 + Math.random() * 5); // 2-6
                const q = Math.floor(3 + Math.random() * 8); // 3-10
                geometry = new THREE.TorusKnotGeometry(
                    1 + Math.random() * 2,   // radius
                    0.2 + Math.random() * 0.6, // tube radius
                    Math.floor(32 + Math.random() * 96), // tubular segments (32-128)
                    Math.floor(4 + Math.random() * 12),  // radial segments (4-16)
                    p, q                     // p and q determine the knot shape
                );
                break;
            case 6:
                // Icosahedron with varying detail level
                const icoDetail = Math.floor(Math.random() * 3); // 0-2 detail level
                geometry = new THREE.IcosahedronGeometry(1 + Math.random() * 2, icoDetail);
                break;
            case 7:
                // Octahedron with varying detail level
                const octDetail = Math.floor(Math.random() * 3); // 0-2 detail level
                geometry = new THREE.OctahedronGeometry(1 + Math.random() * 2, octDetail);
                break;
            case 8:
                // Tetrahedron with varying detail level
                const tetraDetail = Math.floor(Math.random() * 3); // 0-2 detail level
                geometry = new THREE.TetrahedronGeometry(1 + Math.random() * 2, tetraDetail);
                break;
            case 9:
                // Create a custom geometry - a star-like shape
                const starGeometry = new THREE.BufferGeometry();
                const vertices = [];
                const points = 5 + Math.floor(Math.random() * 5); // 5-9 points
                const innerRadius = 0.5 + Math.random() * 1;
                const outerRadius = 1.5 + Math.random() * 2;
                
                // Create star vertices
                for (let p = 0; p < points * 2; p++) {
                    const angle = (p * Math.PI) / points;
                    const radius = p % 2 === 0 ? outerRadius : innerRadius;
                    vertices.push(
                        radius * Math.sin(angle),
                        radius * Math.cos(angle),
                        (Math.random() - 0.5) * 0.5 // slight z-variation
                    );
                }
                
                // Create faces by connecting vertices
                const indices = [];
                for (let p = 0; p < points * 2 - 2; p++) {
                    indices.push(0, p + 1, p + 2);
                }
                indices.push(0, points * 2 - 1, 1);
                
                starGeometry.setFromPoints(vertices.map((v, i) => 
                    new THREE.Vector3(vertices[i*3], vertices[i*3+1], vertices[i*3+2])
                ));
                starGeometry.setIndex(indices);
                starGeometry.computeVertexNormals();
                
                geometry = starGeometry;
                break;
        }
        
        // Determine if this object should be emissive (glowing)
        const isEmissive = Math.random() < 0.6; // 60% chance
        
        // Create material with zone colors and random variations
        const materialType = Math.random();
        let material;
        
        if (materialType < 0.7) { // 70% chance for physical material
            // Create a physical material with zone colors
            const hueShift = (Math.random() - 0.5) * 0.2; // Small random hue variation
            const color = new THREE.Color(palette.main);
            
            // Apply hue shift
            const hsl = {};
            color.getHSL(hsl);
            hsl.h = (hsl.h + hueShift) % 1.0;
            color.setHSL(hsl.h, hsl.s, hsl.l);
            
            material = new THREE.MeshPhysicalMaterial({
                color: color,
                emissive: isEmissive ? palette.emissive : 0x000000,
                emissiveIntensity: isEmissive ? 0.3 + Math.random() * 0.7 : 0,
                roughness: 0.2 + Math.random() * 0.6,
                metalness: 0.3 + Math.random() * 0.7,
                clearcoat: Math.random() * 1.0,
                clearcoatRoughness: Math.random() * 0.5,
                envMap: envMap,
                reflectivity: 0.5 + Math.random() * 0.5,
                transparent: Math.random() < 0.3, // 30% chance to be transparent
                opacity: Math.random() < 0.3 ? 0.5 + Math.random() * 0.5 : 1.0
            });
        } else { // 30% chance for standard material
            material = new THREE.MeshStandardMaterial({
                color: palette.main,
                emissive: isEmissive ? palette.emissive : 0x000000,
                emissiveIntensity: isEmissive ? 0.3 + Math.random() * 0.7 : 0,
                roughness: 0.3 + Math.random() * 0.7,
                metalness: 0.2 + Math.random() * 0.6,
                envMap: envMap,
                flatShading: Math.random() < 0.5 // 50% chance for flat shading
            });
        }
        
        const object = new THREE.Mesh(geometry, material);
        
        // Position randomly with more variation
        const distributionType = Math.random();
        let x, y, z;
        
        if (distributionType < 0.6) { // 60% chance for wide distribution
            // Wide distribution across the scene
            x = (Math.random() - 0.5) * 800;
            y = -4.5 + Math.random() * 150;
            z = (Math.random() - 0.5) * 8000;
        } else if (distributionType < 0.9) { // 30% chance for cluster distribution
            // Create clusters of objects
            const clusterX = (Math.random() - 0.5) * 500;
            const clusterY = 20 + Math.random() * 60;
            const clusterZ = -Math.random() * 3500;
            
            // Position within the cluster
            x = clusterX + (Math.random() - 0.5) * 50;
            y = clusterY + (Math.random() - 0.5) * 30;
            z = clusterZ + (Math.random() - 0.5) * 50;
        } else { // 10% chance for orbital distribution
            // Create objects that will orbit around a point
            const radius = 30 + Math.random() * 50;
            const angle = Math.random() * Math.PI * 2;
            x = Math.cos(angle) * radius;
            y = 30 + Math.random() * 40;
            z = -500 - Math.random() * 3000 + Math.sin(angle) * radius;
        }
        
        object.position.set(x, y, z);
        
        // Random initial rotation
        object.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        
        // Random scale for more variety
        const baseScale = 0.2 + Math.random() * 4.0; // Increased range from (0.5-3.0) to (0.2-4.2)
        
        // Add a small percentage of extremely large or small objects
        let finalBaseScale = baseScale;
        const extremeSizeRoll = Math.random();
        if (extremeSizeRoll < 0.05) { // 5% chance for extremely large objects
            finalBaseScale = baseScale * (5.0 + Math.random() * 3.0); // 5-8x larger
        } else if (extremeSizeRoll < 0.1) { // 5% chance for extremely small objects
            finalBaseScale = baseScale * (0.05 + Math.random() * 0.15); // 5-20% of normal size
        }
        
        // Decide if this object should have uniform or non-uniform scaling
        if (Math.random() < 0.6) { // 60% uniform scaling
            object.scale.set(finalBaseScale, finalBaseScale, finalBaseScale);
        } else { // 40% non-uniform scaling for more interesting shapes
            object.scale.set(
                finalBaseScale * (0.3 + Math.random() * 1.7),
                finalBaseScale * (0.3 + Math.random() * 1.7),
                finalBaseScale * (0.3 + Math.random() * 1.7)
            );
        }
        
        // Add enhanced animation data for more interesting movements
        const animationType = Math.random();
        const userData = {
            originalPosition: new THREE.Vector3(x, y, z),
            originalScale: object.scale.clone(),
            originalRotation: object.rotation.clone(),
            lastRepositionTime: 0,
            type: zoneName + 'Object',
            
            // Basic animation parameters
            pulseFactor: 0.1 + Math.random() * 0.4,
            pulseSpeed: 0.2 + Math.random() * 1.0,
            
            // Rotation animation
            rotationSpeed: {
                x: (Math.random() - 0.5) * 0.03,
                y: (Math.random() - 0.5) * 0.03,
                z: (Math.random() - 0.5) * 0.03
            },
            
            // Movement animation
            moveSpeed: 0.3 + Math.random() * 2.0,
            moveDistance: 5 + Math.random() * 25,
            movePhase: Math.random() * Math.PI * 2,
            
            // Flag for discrete movement (reduced from 20% to 10% chance)
            canMoveDiscrete: Math.random() < 0.1
        };
        
        // If this object can move discretely, store its original emissive color
        if (userData.canMoveDiscrete && material.emissive) {
            userData.originalEmissive = material.emissive.clone();
        }
        
        // Add specific animation types
        if (animationType < 0.3) {
            // Orbiting objects
            userData.animationType = 'orbit';
            userData.orbitRadius = 10 + Math.random() * 30;
            userData.orbitSpeed = 0.2 + Math.random() * 1.0;
            userData.orbitAxis = Math.floor(Math.random() * 3); // 0=x, 1=y, 2=z
            userData.orbitCenter = new THREE.Vector3(
                userData.originalPosition.x,
                userData.originalPosition.y,
                userData.originalPosition.z
            );
        } else if (animationType < 0.6) {
            // Floating objects
            userData.animationType = 'float';
            userData.floatAmplitude = 5 + Math.random() * 15;
            userData.floatFrequency = 0.1 + Math.random() * 0.5;
            userData.floatPhase = Math.random() * Math.PI * 2;
        } else if (animationType < 0.8) {
            // Pulsing objects
            userData.animationType = 'pulse';
            userData.pulseMin = 0.7 + Math.random() * 0.3;
            userData.pulseMax = 1.0 + Math.random() * 0.5;
            userData.pulseFrequency = 0.2 + Math.random() * 0.8;
        } else {
            // Spinning objects
            userData.animationType = 'spin';
            userData.spinAxis = Math.floor(Math.random() * 3); // 0=x, 1=y, 2=z
            userData.spinSpeed = 0.5 + Math.random() * 2.0;
            userData.spinDirection = Math.random() < 0.5 ? 1 : -1;
        }
        
        object.userData = userData;
        
        scene.add(object);
        environmentObjects[zoneKey].push(object);
        animatedObjects.push(object);
        allObjects.push(object);
    }
    
    console.log(`Created ${objectCount} objects for zone: ${zoneName}`);
}

// Create additional shared geometric objects
function createSharedGeometricObjects(scene, count) {
    console.log(`Creating ${count} additional shared geometric objects`);
    
    // Use geometryCreators directly from import to avoid async issues
    import('./config.js').then(module => {
        const geometryCreators = module.geometryCreators;
        
        for (let i = 0; i < count; i++) {
            // Select a random geometry type
            const geometryCreator = geometryCreators[Math.floor(Math.random() * geometryCreators.length)];
            const geometry = geometryCreator(THREE);
            
            // Use a holographic shiny material
            const hue = Math.random();
            const saturation = 0.8;
            const lightness = 0.6;
            
            const material = new THREE.MeshPhysicalMaterial({
                color: new THREE.Color().setHSL(hue, saturation, lightness),
                metalness: 0.9,
                roughness: 0.1,
                clearcoat: 1.0,
                clearcoatRoughness: 0.1,
                envMap: envMap,
                reflectivity: 1.0,
                transparent: true,
                opacity: 0.8,
                emissive: new THREE.Color().setHSL(hue, saturation, lightness / 2),
                emissiveIntensity: 0.5
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            
            // Position randomly in 3D space, but within reasonable bounds
            const x = (Math.random() - 0.5) * 800;
            const y = -4.5 + Math.random() * 150;
            const z = (Math.random() - 0.5) * 8000;
            
            mesh.position.set(x, y, z);
            
            // Random initial rotation
            mesh.rotation.set(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            );
            
            // Random scale with much more variety
            // Apply different scaling to each axis for non-uniform shapes
            const baseScale = 0.1 + Math.random() * 5.0; // Increased range from (0.5-3.0) to (0.1-5.1)
            
            // Add a small percentage of extremely large or small objects
            let finalBaseScale = baseScale;
            const extremeSizeRoll = Math.random();
            if (extremeSizeRoll < 0.03) { // 3% chance for extremely large objects
                finalBaseScale = baseScale * (4.0 + Math.random() * 4.0); // 4-8x larger
            } else if (extremeSizeRoll < 0.08) { // 5% chance for extremely small objects
                finalBaseScale = baseScale * (0.05 + Math.random() * 0.15); // 5-20% of normal size
            }
            
            // Decide if this object should have uniform or non-uniform scaling
            if (Math.random() < 0.7) { // 70% uniform scaling
                mesh.scale.set(finalBaseScale, finalBaseScale, finalBaseScale);
            } else { // 30% non-uniform scaling for more interesting shapes
                mesh.scale.set(
                    finalBaseScale * (0.5 + Math.random() * 1.5),
                    finalBaseScale * (0.5 + Math.random() * 1.5),
                    finalBaseScale * (0.5 + Math.random() * 1.5)
                );
            }
            
            // Add enhanced animation data
            const animationType = Math.random();
            const userData = {
                originalPosition: new THREE.Vector3(x, y, z),
                originalScale: mesh.scale.clone(),
                originalRotation: mesh.rotation.clone(),
                lastRepositionTime: 0,
                type: 'geometric',
                
                // Basic animation parameters
                rotationSpeed: {
                    x: (Math.random() - 0.5) * 0.03,
                    y: (Math.random() - 0.5) * 0.03,
                    z: (Math.random() - 0.5) * 0.03
                },
                moveSpeed: 0.3 + Math.random() * 2.0,
                moveDistance: 5 + Math.random() * 25,
                movePhase: Math.random() * Math.PI * 2,
                pulseSpeed: 0.2 + Math.random() * 0.8,
                pulseFactor: 0.2 + Math.random() * 0.3,
                
                // Flag for discrete movement (reduced from 30% to 15% chance for geometric objects)
                canMoveDiscrete: Math.random() < 0.15
            };
            
            // If this object can move discretely, store its original emissive color
            if (userData.canMoveDiscrete && material.emissive) {
                userData.originalEmissive = material.emissive.clone();
            }
            
            // Add specific animation types
            if (animationType < 0.25) {
                // Orbiting objects
                userData.animationType = 'orbit';
                userData.orbitRadius = 15 + Math.random() * 40;
                userData.orbitSpeed = 0.2 + Math.random() * 1.0;
                userData.orbitAxis = Math.floor(Math.random() * 3); // 0=x, 1=y, 2=z
                userData.orbitCenter = new THREE.Vector3(
                    userData.originalPosition.x,
                    userData.originalPosition.y,
                    userData.originalPosition.z
                );
            } else if (animationType < 0.5) {
                // Floating objects
                userData.animationType = 'float';
                userData.floatAmplitude = 8 + Math.random() * 20;
                userData.floatFrequency = 0.1 + Math.random() * 0.5;
                userData.floatPhase = Math.random() * Math.PI * 2;
            } else if (animationType < 0.75) {
                // Pulsing objects
                userData.animationType = 'pulse';
                userData.pulseMin = 0.6 + Math.random() * 0.3;
                userData.pulseMax = 1.0 + Math.random() * 0.8;
                userData.pulseFrequency = 0.2 + Math.random() * 0.8;
            } else {
                // Spinning objects
                userData.animationType = 'spin';
                userData.spinAxis = Math.floor(Math.random() * 3); // 0=x, 1=y, 2=z
                userData.spinSpeed = 0.5 + Math.random() * 3.0;
                userData.spinDirection = Math.random() < 0.5 ? 1 : -1;
            }
            
            mesh.userData = userData;
            
            scene.add(mesh);
            animatedObjects.push(mesh);
            allObjects.push(mesh);
            
            // Assign to a random zone
            const zoneKeys = Object.keys(environmentObjects);
            const zoneKey = zoneKeys[Math.floor(Math.random() * zoneKeys.length)];
            environmentObjects[zoneKey].push(mesh);
        }
        
        console.log(`Created ${count} additional shared geometric objects`);
    }).catch(error => {
        console.error("Error creating shared geometric objects:", error);
    });
} 