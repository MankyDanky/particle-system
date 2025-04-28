import "./style.css"

async function initWebGPU() {
  if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
  }

  const canvas = document.getElementById('webgpu-canvas');
  const context = canvas.getContext('webgpu');
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
      device: device,
      format: format,
      alphaMode: 'premultiplied',
  });

  return { device, context, format };
}

async function main() {
  const { device, context, format } = await initWebGPU();
  
  // Camera control variables
  let cameraRotationX = 0;
  let cameraRotationY = 0;
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  const rotationSpeed = 0.01;
  
  // Zoom control variables
  let cameraDistance = 10.0;
  const minZoom = 3.0;
  const maxZoom = 20.0;
  const zoomSpeed = 0.5;
  
  // Define the size of each billboard
  const size = 0.5;
  
  // Bloom settings
  const BLOOM_INTENSITY = 0.8;
  const BLUR_PASSES = 4;  // Number of blur passes
  let bloomTextures = [];
  let bloomBindGroups = [];
  
  // Particle system state
  let particleCount = 100; // Default for burst mode
  const MAX_PARTICLES = 10000;
  let activeParticles = 0;
  let lastTime = performance.now();
  let emissionTimer = 0;
  let currentEmissionTime = 0;
  let emitting = false;
  let burstMode = false;
  
  // Emission settings
  let emissionRate = 10; // particles per second
  let emissionDuration = 10; // seconds
  
  // Emission shape settings
  let emissionShape = 'cube'; // Default: cube
  let cubeLength = 2.0; // Default size of cube
  let innerRadius = 0.0; // Default inner radius for sphere
  let outerRadius = 2.0; // Default outer radius for sphere
  
  // Typed array for particle data: [x, y, z, r, g, b, age, lifetime]
  const particleData = new Float32Array(MAX_PARTICLES * 8);
  
  // Canvas setup
  const canvas = document.getElementById('webgpu-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  // Create higher-quality render textures for the bloom effect
  function createRenderTextures() {
    // Create scene render texture (higher resolution for better sampling)
    const sceneTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Create bloom textures for ping-pong rendering with filtering-friendly format
    const bloomTexA = device.createTexture({
      size: [canvas.width, canvas.height],
      format: format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    const bloomTexB = device.createTexture({
      size: [canvas.width, canvas.height],
      format: format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    return { sceneTexture, bloomTexA, bloomTexB };
  }

  // Create bloom textures
  let { sceneTexture, bloomTexA, bloomTexB } = createRenderTextures();

  // Create depth texture
  let depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  
  // Resize function with better texture management
  function resizeCanvasToDisplaySize() {
    // Store old textures
    const oldSceneTexture = sceneTexture;
    const oldBloomTexA = bloomTexA;
    const oldBloomTexB = bloomTexB;
    const oldDepthTexture = depthTexture;
    
    // Update canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Create new textures with updated size
    const { sceneTexture: newScene, bloomTexA: newBloomA, bloomTexB: newBloomB } = createRenderTextures();
    sceneTexture = newScene;
    bloomTexA = newBloomA;
    bloomTexB = newBloomB;
    
    depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    
    // Update the blur uniforms with new resolution
    const horizontalDirection = new Float32Array([1.0, 0.0, canvas.width, canvas.height, 0.0, 0.0, 0.0, 0.0]);
    const verticalDirection = new Float32Array([0.0, 1.0, canvas.width, canvas.height, 0.0, 0.0, 0.0, 0.0]);
    device.queue.writeBuffer(horizontalBlurUniformBuffer, 0, horizontalDirection);
    device.queue.writeBuffer(verticalBlurUniformBuffer, 0, verticalDirection);
    
    // Recreate bind groups with new textures
    horizontalBlurBindGroup = device.createBindGroup({
      layout: bloomBindGroupLayout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: sceneTexture.createView() },
        { binding: 2, resource: { buffer: horizontalBlurUniformBuffer } }
      ],
    });
    
    verticalBlurBindGroup = device.createBindGroup({
      layout: bloomBindGroupLayout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: bloomTexA.createView() },
        { binding: 2, resource: { buffer: verticalBlurUniformBuffer } }
      ],
    });
    
    compositeBindGroup = device.createBindGroup({
      layout: compositeBindGroupLayout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: sceneTexture.createView() },
        { binding: 2, resource: bloomTexB.createView() }
      ],
    });
    
    // Schedule the old textures for destruction after the current frame completes
    requestAnimationFrame(() => {
      // Destroy old textures in the next frame when they're no longer in use
      oldSceneTexture.destroy();
      oldBloomTexA.destroy();
      oldBloomTexB.destroy();
      oldDepthTexture.destroy();
    });
  }
  
  window.addEventListener('resize', resizeCanvasToDisplaySize);
  
  // Get UI elements
  const lifetimeSlider = document.getElementById('lifetime-slider');
  const lifetimeValue = document.getElementById('lifetime-value');
  const emissionDurationSlider = document.getElementById('emission-duration-slider');
  const emissionDurationValue = document.getElementById('emission-duration-value');
  const emissionRateSlider = document.getElementById('emission-rate-slider');
  const emissionRateValue = document.getElementById('emission-rate-value');
  const particleCountSlider = document.getElementById('particle-count-slider');
  const particleCountValue = document.getElementById('particle-count-value');
  const burstCheckbox = document.getElementById('burst-checkbox');
  const continuousEmissionContainer = document.getElementById('continuous-emission-container');
  const burstEmissionContainer = document.getElementById('burst-emission-container');
  const sizeSlider = document.getElementById('size-slider');
  const sizeValue = document.getElementById('size-value');
  const speedSlider = document.getElementById('speed-slider');
  const speedValue = document.getElementById('speed-value');
  const fadeCheckbox = document.getElementById('fade-checkbox');
  const colorTransitionCheckbox = document.getElementById('color-transition-checkbox');
  const singleColorContainer = document.getElementById('single-color-container');
  const gradientColorContainer = document.getElementById('gradient-color-container');
  const particleColorInput = document.getElementById('particle-color');
  const startColorInput = document.getElementById('start-color');
  const endColorInput = document.getElementById('end-color');
  
  // Shape UI elements
  const emissionShapeSelect = document.getElementById('emission-shape');
  const cubeSettings = document.getElementById('cube-settings');
  const sphereSettings = document.getElementById('sphere-settings');
  const cubeLengthSlider = document.getElementById('cube-length-slider');
  const cubeLengthValue = document.getElementById('cube-length-value');
  const innerRadiusSlider = document.getElementById('inner-radius-slider');
  const innerRadiusValue = document.getElementById('inner-radius-value');
  const outerRadiusSlider = document.getElementById('outer-radius-slider');
  const outerRadiusValue = document.getElementById('outer-radius-value');
  
  // Settings state
  let fadeEnabled = fadeCheckbox.checked;
  let colorTransitionEnabled = colorTransitionCheckbox.checked;
  let particleSize = parseFloat(sizeSlider.value);
  let particleSpeed = parseFloat(speedSlider.value);
  
  // Velocity array to store direction vectors for each particle
  const particleVelocities = new Float32Array(MAX_PARTICLES * 3); // x, y, z velocities
  
  // Convert hex color to RGB [0-1]
  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
  }
  
  // Initialize colors
  let particleColor = hexToRgb(particleColorInput.value);
  let startColor = hexToRgb(startColorInput.value);
  let endColor = hexToRgb(endColorInput.value);

  // UI event listeners
  lifetimeSlider.addEventListener('input', () => {
    const value = lifetimeSlider.value;
    lifetimeValue.textContent = `${value} sec`;
  });
  
  emissionDurationSlider.addEventListener('input', () => {
    const value = emissionDurationSlider.value;
    emissionDurationValue.textContent = `${value} sec`;
    emissionDuration = parseFloat(value);
  });
  
  emissionRateSlider.addEventListener('input', () => {
    const value = emissionRateSlider.value;
    emissionRateValue.textContent = `${value} particles/sec`;
    emissionRate = parseFloat(value);
  });
  
  fadeCheckbox.addEventListener('change', () => {
    fadeEnabled = fadeCheckbox.checked;
    createShaderAndPipeline();
    updateBuffers();
  });
  
  colorTransitionCheckbox.addEventListener('change', () => {
    colorTransitionEnabled = colorTransitionCheckbox.checked;
    
    if (colorTransitionEnabled) {
      singleColorContainer.classList.add('hidden');
      gradientColorContainer.classList.remove('hidden');
    } else {
      singleColorContainer.classList.remove('hidden');
      gradientColorContainer.classList.add('hidden');
    }
    
    createShaderAndPipeline();
    updateBuffers();
  });
  
  // Color input event listeners
  particleColorInput.addEventListener('input', () => {
    particleColor = hexToRgb(particleColorInput.value);
    // Recreate shader to use new color values immediately
    createShaderAndPipeline();
    // Apply color to existing particles
    updateParticleColors();
  });
  
  startColorInput.addEventListener('input', () => {
    startColor = hexToRgb(startColorInput.value);
    // Recreate shader to use new color values immediately
    createShaderAndPipeline();
    // Apply color to existing particles
    updateParticleColors();
  });
  
  endColorInput.addEventListener('input', () => {
    endColor = hexToRgb(endColorInput.value);
    // Recreate shader to use new color values immediately
    createShaderAndPipeline();
    // Apply color to existing particles
    updateParticleColors();
  });
  
  // Update size value display when slider changes
  sizeSlider.addEventListener('input', () => {
    const value = sizeSlider.value;
    sizeValue.textContent = value;
    particleSize = parseFloat(value);
    
    // Recreate the quad geometry with new size
    updateQuadGeometry(particleSize);
    
    // Recreate shader and pipeline to apply new size
    createShaderAndPipeline();
  });
  
  // Update speed value display when slider changes
  speedSlider.addEventListener('input', () => {
    const value = speedSlider.value;
    speedValue.textContent = value;
    particleSpeed = parseFloat(value);
    
    // No need to recreate shader, just update velocity for existing particles
    updateParticleVelocities();
  });
  
  // Update particle count slider
  particleCountSlider.addEventListener('input', () => {
    const value = particleCountSlider.value;
    particleCountValue.textContent = value;
    particleCount = parseInt(value);
  });
  
  // Toggle between continuous and burst mode
  burstCheckbox.addEventListener('change', () => {
    burstMode = burstCheckbox.checked;
    
    if (burstMode) {
      continuousEmissionContainer.classList.add('hidden');
      burstEmissionContainer.classList.remove('hidden');
    } else {
      continuousEmissionContainer.classList.remove('hidden');
      burstEmissionContainer.classList.add('hidden');
    }
  });
  
  // Emission shape event listeners
  emissionShapeSelect.addEventListener('change', () => {
    emissionShape = emissionShapeSelect.value;
    
    if (emissionShape === 'cube') {
      cubeSettings.classList.remove('hidden');
      sphereSettings.classList.add('hidden');
    } else if (emissionShape === 'sphere') {
      cubeSettings.classList.add('hidden');
      sphereSettings.classList.remove('hidden');
    }
  });
  
  // Cube length slider
  cubeLengthSlider.addEventListener('input', () => {
    const value = cubeLengthSlider.value;
    cubeLengthValue.textContent = value;
    cubeLength = parseFloat(value);
  });
  
  // Inner radius slider
  innerRadiusSlider.addEventListener('input', () => {
    const value = innerRadiusSlider.value;
    innerRadiusValue.textContent = value;
    innerRadius = parseFloat(value);
    
    // Make sure inner radius is less than outer radius
    if (innerRadius >= outerRadius) {
      outerRadiusSlider.value = innerRadius + 0.1;
      outerRadiusValue.textContent = outerRadiusSlider.value;
      outerRadius = parseFloat(outerRadiusSlider.value);
    }
  });
  
  // Outer radius slider
  outerRadiusSlider.addEventListener('input', () => {
    const value = outerRadiusSlider.value;
    outerRadiusValue.textContent = value;
    outerRadius = parseFloat(value);
    
    // Make sure outer radius is greater than inner radius
    if (outerRadius <= innerRadius) {
      innerRadiusSlider.value = outerRadius - 0.1;
      innerRadiusValue.textContent = innerRadiusSlider.value;
      innerRadius = parseFloat(innerRadiusSlider.value);
    }
  });
  
  // Initialize emission shape UI
  emissionShapeSelect.value = emissionShape;
  cubeLengthValue.textContent = cubeLengthSlider.value;
  innerRadiusValue.textContent = innerRadiusSlider.value;
  outerRadiusValue.textContent = outerRadiusSlider.value;
  
  // Initialize UI based on initial burst mode state
  burstCheckbox.checked = burstMode;
  if (burstMode) {
    continuousEmissionContainer.classList.add('hidden');
    burstEmissionContainer.classList.remove('hidden');
  } else {
    continuousEmissionContainer.classList.remove('hidden');
    burstEmissionContainer.classList.add('hidden');
  }
  
  // Create shader and pipeline based on current settings
  function createShaderAndPipeline() {
    const shaderModule = device.createShaderModule({
      code: `
        struct Uniforms {
          transform: mat4x4<f32>,
          cameraPosition: vec3<f32>,
          aspectRatio: f32,
        }

        @binding(0) @group(0) var<uniform> uniforms : Uniforms;

        struct VertexInput {
          @location(0) position : vec3<f32>,
          @location(1) particlePosition : vec3<f32>,
          @location(2) particleColor : vec3<f32>,
          @location(3) particleAgeAndLife : vec2<f32>,
        }

        struct VertexOutput {
          @builtin(position) position : vec4<f32>,
          @location(0) color : vec3<f32>,
          @location(1) alpha : f32,
        }

        @vertex
        fn vs_main(input: VertexInput) -> VertexOutput {
          var output : VertexOutput;
          
          let center = input.particlePosition;
          let baseColor = input.particleColor;
          let age = input.particleAgeAndLife.x;
          let lifetime = input.particleAgeAndLife.y;
          let lifeRatio = age / lifetime;
          
          // Calculate color based on settings
          var finalColor = baseColor;
          
          if (${colorTransitionEnabled ? "true" : "false"}) {
            let startColor = vec3<f32>(${startColor[0]}, ${startColor[1]}, ${startColor[2]});
            let endColor = vec3<f32>(${endColor[0]}, ${endColor[1]}, ${endColor[2]});
            finalColor = mix(startColor, endColor, lifeRatio);
          } else {
            let singleColor = vec3<f32>(${particleColor[0]}, ${particleColor[1]}, ${particleColor[2]});
            finalColor = singleColor;
          }
          
          // Calculate alpha based on lifetime
          var alpha = 0.0;
          if (${fadeEnabled ? "true" : "false"}) {
            alpha = max(0.0, 1.0 - lifeRatio);
          } else {
            alpha = select(0.0, 1.0, age < lifetime);
          }
          
          // Transform to view space
          let viewCenter = uniforms.transform * vec4<f32>(center, 1.0);
          
          // Distance-based size scaling with particle size factor
          let cameraToParticle = length(center - uniforms.cameraPosition);
          let baseScaleFactor = 0.15 * ${particleSize}; // Apply the slider value here
          let distanceScaleFactor = baseScaleFactor * (10.0 / cameraToParticle);
          
          // Apply billboard technique
          let finalPosition = vec4<f32>(
            viewCenter.x + input.position.x * distanceScaleFactor * uniforms.aspectRatio * viewCenter.w,
            viewCenter.y + input.position.y * distanceScaleFactor * viewCenter.w,
            viewCenter.z,
            viewCenter.w
          );
          
          output.position = finalPosition;
          output.color = finalColor;
          output.alpha = alpha;
          return output;
        }

        @fragment
        fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
          // Return the particle color with its alpha
          return vec4<f32>(input.color, input.alpha);
        }
      `,
    });

    // Create pipeline with instanced rendering
    pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 3 * 4,
            stepMode: 'vertex',
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x3',
              }
            ],
          },
          {
            arrayStride: 8 * 4,
            stepMode: 'instance',
            attributes: [
              {
                shaderLocation: 1,
                offset: 0,
                format: 'float32x3',
              },
              {
                shaderLocation: 2,
                offset: 3 * 4,
                format: 'float32x3',
              },
              {
                shaderLocation: 3,
                offset: 6 * 4,
                format: 'float32x2',
              }
            ],
          }
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: format,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
        }],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });
  }
  
  // Button event handlers
  const respawnButton = document.getElementById('respawn-button');
  respawnButton.addEventListener('click', () => {
    spawnParticles();
  });
  
  // Camera control event listeners
  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });
  
  window.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  window.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const deltaX = e.clientX - lastMouseX;
      const deltaY = e.clientY - lastMouseY;
      
      cameraRotationY -= deltaX * rotationSpeed;
      cameraRotationX += deltaY * rotationSpeed;
      
      // Limit vertical rotation to prevent flipping
      cameraRotationX = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cameraRotationX));
      
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    }
  });
  
  // Zoom control
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    const zoomAmount = e.deltaY * 0.01;
    cameraDistance = Math.max(minZoom, Math.min(maxZoom, cameraDistance + zoomAmount));
  }, { passive: false }); // Set passive to false explicitly to handle preventDefault
  
  // Set up geometry for instanced rendering
  const quadVertices = new Float32Array([
    -size, -size, 0,
    size, -size, 0,
    size, size, 0,
    -size, size, 0
  ]);
  
  const quadIndices = new Uint16Array([
    0, 1, 2,
    2, 3, 0
  ]);
  
  // Create buffers
  const quadVertexBuffer = device.createBuffer({
    size: quadVertices.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(quadVertexBuffer.getMappedRange()).set(quadVertices);
  quadVertexBuffer.unmap();
  
  const quadIndexBuffer = device.createBuffer({
    size: quadIndices.byteLength,
    usage: GPUBufferUsage.INDEX,
    mappedAtCreation: true,
  });
  new Uint16Array(quadIndexBuffer.getMappedRange()).set(quadIndices);
  quadIndexBuffer.unmap();
  
  const instanceBuffer = device.createBuffer({
    size: MAX_PARTICLES * 8 * 4,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  
  const uniformBuffer = device.createBuffer({
    size: 80, // MVP matrix + camera position + aspect
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  
  // Spawn particles
  function spawnParticles() {
    // Reset counters
    activeParticles = 0;
    currentEmissionTime = 0;
    emissionTimer = 0;
    
    if (burstMode) {
      // Burst mode: emit all particles at once
      const burstCount = particleCount;
      
      // Emit all particles immediately
      for (let i = 0; i < burstCount; i++) {
        emitParticle();
      }
      
      // No need to continue emitting
      emitting = false;
    } else {
      // Continuous emission mode
      emitting = true;
      
      // Calculate max particles based on emission rate and duration
      const baseLifetime = parseFloat(lifetimeSlider.value);
      const effectiveDuration = Math.min(emissionDuration, baseLifetime);
      particleCount = Math.min(Math.ceil(emissionRate * effectiveDuration), MAX_PARTICLES);
    }
  }
  
  // Emit a single particle
  function emitParticle() {
    if (activeParticles >= particleCount) return false;
    
    const index = activeParticles * 8;
    let posX, posY, posZ;
    
    if (emissionShape === 'cube') {
      // Generate random position within a cube
      const halfLength = cubeLength / 2;
      posX = (Math.random() - 0.5) * cubeLength;
      posY = (Math.random() - 0.5) * cubeLength;
      posZ = (Math.random() - 0.5) * cubeLength;
    } else if (emissionShape === 'sphere') {
      // Generate random position within a sphere shell (between inner and outer radius)
      // First generate random direction (uniform distribution on sphere)
      let theta = Math.random() * 2 * Math.PI; // azimuthal angle
      let phi = Math.acos(2 * Math.random() - 1); // polar angle
      
      // Calculate direction vector
      let dirX = Math.sin(phi) * Math.cos(theta);
      let dirY = Math.sin(phi) * Math.sin(theta);
      let dirZ = Math.cos(phi);
      
      // Generate random radius between inner and outer
      let radius;
      if (innerRadius === 0) {
        // For solid sphere, use cubic distribution for uniform volume distribution
        radius = outerRadius * Math.cbrt(Math.random());
      } else {
        // For shell, interpolate between inner and outer
        radius = innerRadius + (outerRadius - innerRadius) * Math.random();
      }
      
      // Calculate position
      posX = dirX * radius;
      posY = dirY * radius;
      posZ = dirZ * radius;
    }
    
    // Normalize to get direction vector from origin
    const length = Math.sqrt(posX * posX + posY * posY + posZ * posZ) || 0.0001; // Avoid division by zero
    const dirX = posX / length;
    const dirY = posY / length;
    const dirZ = posZ / length;
    
    // Set position
    particleData[index] = posX;
    particleData[index + 1] = posY;
    particleData[index + 2] = posZ;
    
    // Store velocity vector for this particle (scaled by speed)
    const velIndex = activeParticles * 3;
    particleVelocities[velIndex] = dirX * particleSpeed;
    particleVelocities[velIndex + 1] = dirY * particleSpeed;
    particleVelocities[velIndex + 2] = dirZ * particleSpeed;
    
    // Color
    if (colorTransitionEnabled) {
      particleData[index + 3] = startColor[0];
      particleData[index + 4] = startColor[1];
      particleData[index + 5] = startColor[2];
    } else {
      particleData[index + 3] = particleColor[0];
      particleData[index + 4] = particleColor[1];
      particleData[index + 5] = particleColor[2];
    }
    
    // Age and lifetime - set a lifetime from the slider
    const baseLifetime = parseFloat(lifetimeSlider.value);
    particleData[index + 6] = 0; // Age starts at 0
    particleData[index + 7] = baseLifetime + Math.random() * 2 - 1; // Add a small random variance
    
    activeParticles++;
    return true;
  }
  
  // Update particles
  function updateBuffers() {
    let newActiveCount = 0;
    for (let i = 0; i < activeParticles; i++) {
      const age = particleData[i * 8 + 6];
      const lifetime = particleData[i * 8 + 7];
      
      if (age >= lifetime) continue;
      
      if (newActiveCount !== i) {
        // Copy particle data
        for (let j = 0; j < 8; j++) {
          particleData[newActiveCount * 8 + j] = particleData[i * 8 + j];
        }
        
        // Also copy the velocity data to keep arrays in sync
        for (let j = 0; j < 3; j++) {
          particleVelocities[newActiveCount * 3 + j] = particleVelocities[i * 3 + j];
        }
      }
      newActiveCount++;
    }
    activeParticles = newActiveCount;
    
    device.queue.writeBuffer(instanceBuffer, 0, particleData, 0, activeParticles * 8 * 4);
  }
  
  // Function to update colors of existing particles
  function updateParticleColors() {
    for (let i = 0; i < activeParticles; i++) {
      const index = i * 8;
      
      // Update color based on current settings
      if (colorTransitionEnabled) {
        particleData[index + 3] = startColor[0];
        particleData[index + 4] = startColor[1];
        particleData[index + 5] = startColor[2];
      } else {
        particleData[index + 3] = particleColor[0];
        particleData[index + 4] = particleColor[1];
        particleData[index + 5] = particleColor[2];
      }
    }
    
    // Update the buffer with the new colors
    if (activeParticles > 0) {
      device.queue.writeBuffer(instanceBuffer, 0, particleData, 0, activeParticles * 8 * 4);
    }
  }
  
  // Function to update velocity of existing particles
  function updateParticleVelocities() {
    for (let i = 0; i < activeParticles; i++) {
      const index = i * 8; // Position data index
      const velIndex = i * 3; // Velocity data index
      
      // Get the current position
      const posX = particleData[index];
      const posY = particleData[index + 1];
      const posZ = particleData[index + 2];
      
      // Calculate direction away from origin (normalize the position vector)
      const length = Math.sqrt(posX * posX + posY * posY + posZ * posZ) || 0.0001; // Avoid division by zero
      const dirX = posX / length;
      const dirY = posY / length;
      const dirZ = posZ / length;
      
      // Update velocity in the direction away from origin based on current speed setting
      particleVelocities[velIndex] = dirX * particleSpeed;
      particleVelocities[velIndex + 1] = dirY * particleSpeed;
      particleVelocities[velIndex + 2] = dirZ * particleSpeed;
    }
  }

  // Create pipeline layout
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX,
      buffer: { type: 'uniform' }
    }],
  });

  // Create bloom-related bind group layouts and pipelines
  const bloomBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {}
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {}
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' }
      }
    ]
  });

  // Create bloom uniforms (separate buffers for horizontal and vertical blur)
  const horizontalBlurUniformBuffer = device.createBuffer({
    size: 32, // direction (vec2) + resolution (vec2) + padding
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  
  const verticalBlurUniformBuffer = device.createBuffer({
    size: 32, // direction (vec2) + resolution (vec2) + padding
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  
  // Pre-fill the buffers with their respective direction values
  const horizontalDirection = new Float32Array([1.0, 0.0, canvas.width, canvas.height, 0.0, 0.0, 0.0, 0.0]);
  const verticalDirection = new Float32Array([0.0, 1.0, canvas.width, canvas.height, 0.0, 0.0, 0.0, 0.0]);
  
  device.queue.writeBuffer(horizontalBlurUniformBuffer, 0, horizontalDirection);
  device.queue.writeBuffer(verticalBlurUniformBuffer, 0, verticalDirection);

  // Create a high-quality sampler for texture filtering
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    maxAnisotropy: 16 // Higher anisotropy for better quality
  });

  // Create blur shader module
  const blurShaderModule = device.createShaderModule({
    code: `
      struct BloomUniforms {
        direction: vec2<f32>,
        resolution: vec2<f32>,
        padding: vec2<f32>,  // Add padding to meet 32-byte alignment requirements
      }

      @binding(0) @group(0) var texSampler: sampler;
      @binding(1) @group(0) var inputTexture: texture_2d<f32>;
      @binding(2) @group(0) var<uniform> uniforms: BloomUniforms;

      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) texCoord: vec2<f32>,
      }

      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        var output: VertexOutput;
        
        // Generate fullscreen triangle
        let positions = array<vec2<f32>, 3>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(3.0, -1.0),
          vec2<f32>(-1.0, 3.0)
        );
        
        let texCoords = array<vec2<f32>, 3>(
          vec2<f32>(0.0, 1.0),
          vec2<f32>(2.0, 1.0),
          vec2<f32>(0.0, -1.0)
        );
        
        output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
        output.texCoord = texCoords[vertexIndex];
        return output;
      }

      @fragment
      fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
        // Use a high-quality blur kernel with larger radius
        let pixelSize = 1.0 / uniforms.resolution;
        
        // Gaussian weights (normalized)
        let weights = array<f32, 13>(
          0.002216, 0.008764, 0.026995, 0.064759, 0.120985, 0.176033, 
          0.199471, // Center weight
          0.176033, 0.120985, 0.064759, 0.026995, 0.008764, 0.002216
        );
        
        // Start with center sample
        var result = textureSample(inputTexture, texSampler, input.texCoord) * weights[6];
        
        // Use larger step size to increase blur radius
        let stepSize = 3.0; // Increased from 1.0 to 3.0 for a wider bloom radius
        
        // Sample in both positive and negative directions
        for (var i = 1; i < 7; i++) {
          let offset = uniforms.direction * f32(i) * pixelSize * stepSize;
          
          // Sample pairs symmetrically around center
          result += textureSample(inputTexture, texSampler, input.texCoord + offset) * weights[6 + i];
          result += textureSample(inputTexture, texSampler, input.texCoord - offset) * weights[6 - i];
        }
        
        return result;
      }
    `,
  });

  // Create final composite shader module
  const compositeShaderModule = device.createShaderModule({
    code: `
      // Increase bloom intensity for a more visible effect
      const BLOOM_INTENSITY: f32 = 3;

      @binding(0) @group(0) var texSampler: sampler;
      @binding(1) @group(0) var originalTexture: texture_2d<f32>;
      @binding(2) @group(0) var blurredTexture: texture_2d<f32>;

      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) texCoord: vec2<f32>,
      }

      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        var output: VertexOutput;
        
        // Generate fullscreen triangle
        let positions = array<vec2<f32>, 3>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(3.0, -1.0),
          vec2<f32>(-1.0, 3.0)
        );
        
        let texCoords = array<vec2<f32>, 3>(
          vec2<f32>(0.0, 1.0),
          vec2<f32>(2.0, 1.0),
          vec2<f32>(0.0, -1.0)
        );
        
        output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
        output.texCoord = texCoords[vertexIndex];
        return output;
      }

      @fragment
      fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
        let originalColor = textureSample(originalTexture, texSampler, input.texCoord);
        let bloomColor = textureSample(blurredTexture, texSampler, input.texCoord);
        
        // Add bloom to original color using hardcoded intensity and make sure alpha isn't affected
        return vec4<f32>(originalColor.rgb + (bloomColor.rgb * BLOOM_INTENSITY), originalColor.a);
      }
    `,
  });

  // Create bloom pipeline layouts
  const blurPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bloomBindGroupLayout]
  });

  // Create composite bind group layout without uniform buffer
  const compositeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {}
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {}
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {}
      }
    ]
  });

  const compositePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [compositeBindGroupLayout]
  });

  // Create bloom intensity uniform buffer
  const bloomIntensityBuffer = device.createBuffer({
    size: 64, // Increase to 64 bytes to ensure we have enough space
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  
  // Fill with bloomIntensity and padding to fill 64 bytes (16 floats)
  const bloomIntensityData = new Float32Array(16).fill(0); // Initialize all to 0
  bloomIntensityData[0] = BLOOM_INTENSITY; // Only the first value is used
  device.queue.writeBuffer(bloomIntensityBuffer, 0, bloomIntensityData);

  // Create blur pipeline
  const blurPipeline = device.createRenderPipeline({
    layout: blurPipelineLayout,
    vertex: {
      module: blurShaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: blurShaderModule,
      entryPoint: 'fs_main',
      targets: [{
        format: format,
        blend: {
          color: {
            srcFactor: 'one',
            dstFactor: 'one',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one',
            operation: 'add',
          },
        },
      }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  // Create composite pipeline
  const compositePipeline = device.createRenderPipeline({
    layout: compositePipelineLayout,
    vertex: {
      module: compositeShaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: compositeShaderModule,
      entryPoint: 'fs_main',
      targets: [{
        format: format,
        blend: {
          color: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        },
      }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  // Create horizontal and vertical blur bind groups
  let horizontalBlurBindGroup = device.createBindGroup({
    layout: bloomBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: sampler,
      },
      {
        binding: 1,
        resource: sceneTexture.createView(),
      },
      {
        binding: 2,
        resource: { buffer: horizontalBlurUniformBuffer },
      }
    ],
  });

  let verticalBlurBindGroup = device.createBindGroup({
    layout: bloomBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: sampler,
      },
      {
        binding: 1,
        resource: bloomTexA.createView(),
      },
      {
        binding: 2,
        resource: { buffer: verticalBlurUniformBuffer },
      }
    ],
  });

  // Final composite bind group
  let compositeBindGroup = device.createBindGroup({
    layout: compositeBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: sampler,
      },
      {
        binding: 1,
        resource: sceneTexture.createView(),
      },
      {
        binding: 2,
        resource: bloomTexB.createView(),
      }
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  let pipeline;
  createShaderAndPipeline();

  // Create bind group
  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{
      binding: 0,
      resource: { buffer: uniformBuffer },
    }],
  });

  // Create projection matrix
  function createProjectionMatrix(aspect) {
    const fov = Math.PI / 4;
    const near = 0.1;
    const far = 100.0;
    
    const f = 1.0 / Math.tan(fov / 2);
    
    return new Float32Array([
      f * aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) / (near - far), -1,
      0, 0, (2 * far * near) / (near - far), 0,
    ]);
  }

  // Animation loop
  function frame(currentTime) {
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    // Update particle state (age, position, etc.)
    if (emitting) {
      // Update emission timer
      currentEmissionTime += deltaTime;
      emissionTimer += deltaTime;
      
      // Check if we're still within emission duration
      if (currentEmissionTime < emissionDuration) {
        // Calculate how many particles to emit this frame
        const particlesToEmit = emissionRate * deltaTime;
        let wholeParticlesToEmit = Math.floor(particlesToEmit);
        const fractionalPart = particlesToEmit - wholeParticlesToEmit;
        
        // Handle fractional particles (probabilistic emission)
        if (Math.random() < fractionalPart) {
          wholeParticlesToEmit += 1;
        }
        
        // Emit particles
        for (let i = 0; i < wholeParticlesToEmit; i++) {
          emitParticle();
        }
      } else if (emitting) {
        // Stop emitting once duration is reached
        emitting = false;
      }
    }
    
    // Update particle positions and ages
    let needsUpdate = false;
    for (let i = 0; i < activeParticles; i++) {
      // Update age
      particleData[i * 8 + 6] += deltaTime;
      
      // Update position based on velocity and deltaTime
      const velIndex = i * 3;
      const posIndex = i * 8;
      
      // Apply velocity to position
      particleData[posIndex] += particleVelocities[velIndex] * deltaTime;
      particleData[posIndex + 1] += particleVelocities[velIndex + 1] * deltaTime;
      particleData[posIndex + 2] += particleVelocities[velIndex + 2] * deltaTime;
      
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      updateBuffers();
    }
    
    const aspect = canvas.height / canvas.width;
    const projectionMatrix = createProjectionMatrix(aspect);
    
    // Calculate camera position
    const cameraX = cameraDistance * Math.sin(cameraRotationY) * Math.cos(cameraRotationX);
    const cameraY = cameraDistance * Math.sin(cameraRotationX);
    const cameraZ = cameraDistance * Math.cos(cameraRotationY) * Math.cos(cameraRotationX);
    
    const cameraPos = [cameraX, cameraY, cameraZ];
    
    // Create view matrix
    const viewMatrix = createLookAtMatrix(
      cameraPos,
      [0, 0, 0],
      [0, 1, 0]
    );
    
    // Create MVP matrix
    const mvpMatrix = multiplyMatrices(projectionMatrix, viewMatrix);
    
    // Update uniform buffer
    device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix);
    device.queue.writeBuffer(uniformBuffer, 64, new Float32Array([cameraX, cameraY, cameraZ, aspect]));
    
    // Render frame
    const commandEncoder = device.createCommandEncoder();
    
    // 1. First render ONLY the particles to a texture (no background)
    const sceneRenderPassDescriptor = {
      colorAttachments: [{
        view: sceneTexture.createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }, // Clear to transparent black
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };
    
    // Render particles to scene texture with transparency
    const scenePassEncoder = commandEncoder.beginRenderPass(sceneRenderPassDescriptor);
    scenePassEncoder.setPipeline(pipeline);
    scenePassEncoder.setBindGroup(0, bindGroup);
    
    scenePassEncoder.setVertexBuffer(0, quadVertexBuffer);
    scenePassEncoder.setVertexBuffer(1, instanceBuffer);
    scenePassEncoder.setIndexBuffer(quadIndexBuffer, 'uint16');
    
    if (activeParticles > 0) {
      scenePassEncoder.drawIndexed(6, activeParticles);
    }
    
    scenePassEncoder.end();
    
    // 2. Apply horizontal blur from scene texture to bloomTexA
    const horizontalBlurPassDescriptor = {
      colorAttachments: [{
        view: bloomTexA.createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }, // Clear to transparent
      }],
    };
    
    const horizontalBlurPassEncoder = commandEncoder.beginRenderPass(horizontalBlurPassDescriptor);
    horizontalBlurPassEncoder.setPipeline(blurPipeline);
    horizontalBlurPassEncoder.setBindGroup(0, horizontalBlurBindGroup);
    horizontalBlurPassEncoder.draw(3); // Draw a fullscreen triangle
    horizontalBlurPassEncoder.end();
    
    // 3. Apply vertical blur from bloomTexA to bloomTexB
    const verticalBlurPassDescriptor = {
      colorAttachments: [{
        view: bloomTexB.createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }, // Clear to transparent
      }],
    };
    
    const verticalBlurPassEncoder = commandEncoder.beginRenderPass(verticalBlurPassDescriptor);
    verticalBlurPassEncoder.setPipeline(blurPipeline);
    verticalBlurPassEncoder.setBindGroup(0, verticalBlurBindGroup);
    verticalBlurPassEncoder.draw(3); // Draw a fullscreen triangle
    verticalBlurPassEncoder.end();
    
    // 4. Final composite pass - blend the bloomed particles onto a solid background
    const compositePassDescriptor = {
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0.1, g: 0.2, b: 0.3, a: 1.0 }, // Set the background color here
      }],
    };
    
    const compositePassEncoder = commandEncoder.beginRenderPass(compositePassDescriptor);
    compositePassEncoder.setPipeline(compositePipeline);
    compositePassEncoder.setBindGroup(0, compositeBindGroup);
    compositePassEncoder.draw(3); // Draw a fullscreen triangle
    compositePassEncoder.end();
    
    device.queue.submit([commandEncoder.finish()]);
    
    requestAnimationFrame(frame);
  }
  
  // Matrix and vector helper functions
  function createLookAtMatrix(eye, target, up) {
    const zAxis = normalizeVector([
      eye[0] - target[0],
      eye[1] - target[1],
      eye[2] - target[2]
    ]);
    
    const xAxis = normalizeVector(crossProduct(up, zAxis));
    const yAxis = crossProduct(zAxis, xAxis);
    
    return new Float32Array([
      xAxis[0], yAxis[0], zAxis[0], 0,
      xAxis[1], yAxis[1], zAxis[1], 0,
      xAxis[2], yAxis[2], zAxis[2], 0,
      -dotProduct(xAxis, eye), -dotProduct(yAxis, eye), -dotProduct(zAxis, eye), 1
    ]);
  }
  
  function normalizeVector(v) {
    const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / length, v[1] / length, v[2] / length];
  }
  
  function crossProduct(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }
  
  function dotProduct(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  
  function multiplyMatrices(a, b) {
    const result = new Float32Array(16);
    
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += a[i + k * 4] * b[k + j * 4];
        }
        result[i + j * 4] = sum;
      }
    }
    
    return result;
  }

  // Update quad geometry with new size
  function updateQuadGeometry(size) {
    // Create new vertices with the updated size
    const newQuadVertices = new Float32Array([
      -size, -size, 0,
      size, -size, 0,
      size, size, 0,
      -size, size, 0
    ]);
    
    // Update the vertex buffer with new sized vertices
    device.queue.writeBuffer(quadVertexBuffer, 0, newQuadVertices);
  }

  // Initialize particles and start animation
  spawnParticles();
  lastTime = performance.now();
  requestAnimationFrame(frame);
}

main();