// Visual effects for the music visualization

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Post-processing effects
let composer, bloomPass;

// Background uniforms for the psychedelic effect
let backgroundUniforms;
let skybox;

// Create a psychedelic background
export function createPsychedelicBackground(scene) {
    // Create a sky sphere with a custom shader material
    const skyGeometry = new THREE.SphereGeometry(450, 64, 64); // Changed from BoxGeometry to SphereGeometry
    
    // Shader uniforms
    backgroundUniforms = {
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        bassIntensity: { value: 0.0 },
        midIntensity: { value: 0.0 },
        trebleIntensity: { value: 0.0 },
        colorShift: { value: 0.0 },
        zoneColor: { value: new THREE.Color(0x1a237e) } // Default to low energy zone color
    };
    
    // Vertex shader
    const skyVertexShader = `
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
            vUv = uv;
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    
    // Fragment shader for psychedelic background
    const skyFragmentShader = `
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
            // Normalized coordinates
            vec2 uv = vUv;
            
            // Create a base color from the zone color
            vec3 baseColor = zoneColor;
            
            // Create psychedelic patterns using noise
            // Reduced bass impact from 3.0 to 1.5 and added fixed base value
            float noiseScale = 2.0 + bassIntensity * 1.5;
            // Reduced mid impact from 0.5 to 0.2
            float noiseSpeed = time * (0.1 + midIntensity * 0.2);
            
            // Multiple layers of noise for more complex patterns
            float noise1 = snoise(vec3(uv * noiseScale, noiseSpeed * 0.5)) * 0.5 + 0.5;
            float noise2 = snoise(vec3(uv * noiseScale * 2.0, noiseSpeed * 0.7 + 100.0)) * 0.5 + 0.5;
            float noise3 = snoise(vec3(uv * noiseScale * 4.0, noiseSpeed * 0.3 + 200.0)) * 0.5 + 0.5;
            
            // Combine noise layers
            float combinedNoise = (noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2);
            
            // Create color patterns
            // Reduced combinedNoise impact from 0.3 to 0.15
            float hue = colorShift + combinedNoise * 0.15;
            // Reduced midIntensity impact from 0.5 to 0.3
            float saturation = 0.5 + midIntensity * 0.3;
            // Reduced trebleIntensity impact from 0.7 to 0.4
            float brightness = 0.3 + trebleIntensity * 0.4;
            
            // Convert HSV to RGB - use more vibrant colors
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
            
            // Blend with base color
            // Increased base color influence for more stability
            vec3 rgb = mix(baseColor, noiseColor, 0.5); // Changed from 0.7 to 0.5
            
            // Add wave patterns - reduced treble impact from 0.3 to 0.15
            float wave = sin(uv.x * 20.0 + time) * cos(uv.y * 20.0 + time * 0.7) * (0.1 + trebleIntensity * 0.15);
            rgb += wave * vec3(0.2, 0.3, 0.4); // Colored waves
            
            // Add spiral patterns - reduced bass impact
            float angle = atan(uv.y - 0.5, uv.x - 0.5);
            float radius = length(uv - 0.5);
            // Reduced time multiplier from 2.0 to 1.0 for slower animation
            float spiral = sin(radius * 50.0 - angle * 10.0 - time * 1.0) * 0.5 + 0.5;
            // Reduced bassIntensity impact
            rgb += spiral * vec3(0.1, 0.05, 0.2) * (bassIntensity * 0.5 + 0.2);
            
            // Add pulsing glow - reduced bassIntensity impacts 
            // Reduced time factor from 2.0 to 1.0 and pulse amplitude from 0.5 to 0.3
            float pulse = sin(time * (1.0 + bassIntensity * 1.0)) * 0.3 + 0.5;
            rgb *= 1.0 + pulse * bassIntensity * 0.3; // Reduced from 0.5 to 0.3
            
            // Add vignette effect
            vec2 center = vec2(0.5, 0.5);
            float dist = distance(uv, center);
            float vignette = smoothstep(0.5, 0.2, dist);
            rgb *= vignette;
            
            // Add starfield effect - reduced trebleIntensity impact
            float stars = pow(noise3, 20.0) * trebleIntensity * 0.7; // Added 0.7 multiplier
            rgb += stars * vec3(1.0, 1.0, 1.0);
            
            // Final color
            gl_FragColor = vec4(rgb, 1.0 - dist * 0.5); // Slight transparency at edges
        }
    `;
    
    // Create shader material
    const skyMaterial = new THREE.ShaderMaterial({
        uniforms: backgroundUniforms,
        vertexShader: skyVertexShader,
        fragmentShader: skyFragmentShader,
        side: THREE.BackSide,
        transparent: true
    });
    
    // Create sky sphere mesh
    skybox = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(skybox);
    
    console.log("Psychedelic sky sphere created");
    
    return { skybox, backgroundUniforms };
}

// Update background shader uniforms
export function updateBackgroundUniforms(elapsedTime, bassIntensity, midIntensity, trebleIntensity, zoneColor) {
    if (!backgroundUniforms) return;
    
    // Store previous values to allow smoothing
    if (!backgroundUniforms.lastBass) {
        backgroundUniforms.lastBass = 0;
        backgroundUniforms.lastMid = 0;
        backgroundUniforms.lastTreble = 0;
    }
    
    // Apply smoothing (lerp between old and new values)
    const smoothFactor = 0.05; // Lower = slower transitions
    const smoothedBass = backgroundUniforms.lastBass + (bassIntensity - backgroundUniforms.lastBass) * smoothFactor;
    const smoothedMid = backgroundUniforms.lastMid + (midIntensity - backgroundUniforms.lastMid) * smoothFactor;
    const smoothedTreble = backgroundUniforms.lastTreble + (trebleIntensity - backgroundUniforms.lastTreble) * smoothFactor;
    
    // Save current smoothed values for next frame
    backgroundUniforms.lastBass = smoothedBass;
    backgroundUniforms.lastMid = smoothedMid;
    backgroundUniforms.lastTreble = smoothedTreble;
    
    // Apply to shader uniforms
    backgroundUniforms.time.value = elapsedTime;
    backgroundUniforms.bassIntensity.value = smoothedBass;
    backgroundUniforms.midIntensity.value = smoothedMid;
    backgroundUniforms.trebleIntensity.value = smoothedTreble;
    backgroundUniforms.colorShift.value = (elapsedTime * 0.02) % 1.0; // Reduced speed from 0.05 to 0.02
    
    // Update zone color if provided
    if (zoneColor) {
        backgroundUniforms.zoneColor.value.set(zoneColor);
    }
}

// Handle zone-based visual updates
export function handleZoneChange(event, scene) {
    if (!event || !event.detail) return;
    
    console.log(`Handling zone change in effects.js:`, event.detail);
    
    // Update fog color
    if (scene.fog && event.detail.fogColor) {
        scene.fog.color.copy(event.detail.fogColor);
    }
    
    // Update ambient light color
    if (event.detail.ambientColor) {
        scene.children.forEach(child => {
            if (child instanceof THREE.AmbientLight) {
                child.color.set(event.detail.ambientColor);
            }
        });
    }
    
    // Update background color
    if (backgroundUniforms && event.detail.zoneColor) {
        backgroundUniforms.zoneColor.value.set(event.detail.zoneColor);
    }
}

// Get background uniforms
export function getBackgroundUniforms() {
    return backgroundUniforms;
}

// Setup post-processing effects with bloom
export function setupPostProcessing(renderer, scene, camera) {
    // Create render pass
    const renderPass = new RenderPass(scene, camera);
    
    // Create bloom pass with initial parameters
    const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
    bloomPass = new UnrealBloomPass(resolution, 0.5, 0.4, 0.85);
    
    // Create effect composer
    composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    
    console.log("Post-processing effects setup complete");
    return composer;
}

// Update bloom effect based on audio intensity
export function updateBloomEffect(bass, mid, treble) {
    if (!bloomPass) return;
    
    // Make bloom intensity react to the music
    // Base intensity plus audio reactivity
    const baseIntensity = 0.3;
    const bassInfluence = bass * 1.5;
    const midInfluence = mid * 0.7;
    const trebleInfluence = treble * 0.4;
    
    // Calculate final bloom strength - more intense during peaks
    const bloomStrength = baseIntensity + 
                         bassInfluence + 
                         midInfluence + 
                         trebleInfluence;
    
    // Calculate bloom radius - wider during bass
    const bloomRadius = 0.7 + bass * 0.3;
    
    // Calculate bloom threshold - lower during quieter parts
    const bloomThreshold = 0.2 + (1 - (bass + mid) / 2) * 0.15;
    
    // Apply bloom parameters with smoothing
    bloomPass.strength = THREE.MathUtils.lerp(bloomPass.strength, bloomStrength, 0.1);
    bloomPass.radius = THREE.MathUtils.lerp(bloomPass.radius, bloomRadius, 0.1);
    bloomPass.threshold = THREE.MathUtils.lerp(bloomPass.threshold, bloomThreshold, 0.1);
}

// Handle window resizing for post-processing
export function handlePostProcessingResize(renderer, width, height) {
    if (composer) {
        composer.setSize(width, height);
    }
} 