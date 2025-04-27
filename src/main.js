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
  
  // Particle system state
  let particleCount = 50;
  const MAX_PARTICLES = 10000;
  let activeParticles = 0;
  let lastTime = performance.now();
  
  // Typed array for particle data: [x, y, z, r, g, b, age, lifetime]
  const particleData = new Float32Array(MAX_PARTICLES * 8);
  
  // Canvas setup
  const canvas = document.getElementById('webgpu-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  // Create depth texture
  let depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  
  // Resize function
  function resizeCanvasToDisplaySize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    depthTexture.destroy();
    depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }
  
  window.addEventListener('resize', resizeCanvasToDisplaySize);
  
  // Get UI elements
  const lifetimeSlider = document.getElementById('lifetime-slider');
  const lifetimeValue = document.getElementById('lifetime-value');
  const countSlider = document.getElementById('count-slider');
  const countValue = document.getElementById('count-value');
  const fadeCheckbox = document.getElementById('fade-checkbox');
  const colorTransitionCheckbox = document.getElementById('color-transition-checkbox');
  const singleColorContainer = document.getElementById('single-color-container');
  const gradientColorContainer = document.getElementById('gradient-color-container');
  const particleColorInput = document.getElementById('particle-color');
  const startColorInput = document.getElementById('start-color');
  const endColorInput = document.getElementById('end-color');
  
  // Settings state
  let fadeEnabled = fadeCheckbox.checked;
  let colorTransitionEnabled = colorTransitionCheckbox.checked;
  
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
  
  countSlider.addEventListener('input', () => {
    const value = countSlider.value;
    countValue.textContent = value;
    particleCount = parseInt(value);
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
  
  particleColorInput.addEventListener('input', () => {
    particleColor = hexToRgb(particleColorInput.value);
    spawnParticles();
  });
  
  startColorInput.addEventListener('input', () => {
    startColor = hexToRgb(startColorInput.value);
    spawnParticles();
  });
  
  endColorInput.addEventListener('input', () => {
    endColor = hexToRgb(endColorInput.value);
    spawnParticles();
  });
  
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
          
          // Distance-based size scaling
          let cameraToParticle = length(center - uniforms.cameraPosition);
          let baseScaleFactor = 0.15;
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
  });
  
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
    activeParticles = 0;
    
    const baseLifetime = parseFloat(lifetimeSlider.value);
    
    for (let i = 0; i < particleCount; i++) {
      const index = i * 8;
      
      // Position
      particleData[index] = (Math.random() - 0.5) * 10;
      particleData[index + 1] = (Math.random() - 0.5) * 10;
      particleData[index + 2] = (Math.random() - 0.5) * 10;
      
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
      
      // Age and lifetime
      particleData[index + 6] = 0;
      particleData[index + 7] = baseLifetime + Math.random() * 2 - 1;
    }
    
    activeParticles = particleCount;
    device.queue.writeBuffer(instanceBuffer, 0, particleData, 0, activeParticles * 8 * 4);
  }
  
  // Update particles
  function updateBuffers() {
    let newActiveCount = 0;
    for (let i = 0; i < activeParticles; i++) {
      const age = particleData[i * 8 + 6];
      const lifetime = particleData[i * 8 + 7];
      
      if (age >= lifetime) continue;
      
      if (newActiveCount !== i) {
        for (let j = 0; j < 8; j++) {
          particleData[newActiveCount * 8 + j] = particleData[i * 8 + j];
        }
      }
      newActiveCount++;
    }
    activeParticles = newActiveCount;
    
    device.queue.writeBuffer(instanceBuffer, 0, particleData, 0, activeParticles * 8 * 4);
  }
  
  // Create pipeline layout
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX,
      buffer: { type: 'uniform' }
    }],
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
    
    // Update particle ages
    let needsUpdate = false;
    for (let i = 0; i < activeParticles; i++) {
      particleData[i * 8 + 6] += deltaTime;
      if (particleData[i * 8 + 6] % 0.1 < deltaTime) {
        needsUpdate = true;
      }
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
    
    const renderPassDescriptor = {
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0.1, g: 0.2, b: 0.3, a: 1.0 },
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };
    
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    
    passEncoder.setVertexBuffer(0, quadVertexBuffer);
    passEncoder.setVertexBuffer(1, instanceBuffer);
    passEncoder.setIndexBuffer(quadIndexBuffer, 'uint16');
    
    if (activeParticles > 0) {
      passEncoder.drawIndexed(6, activeParticles);
    }
    
    passEncoder.end();
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

  // Initialize particles and start animation
  spawnParticles();
  lastTime = performance.now();
  requestAnimationFrame(frame);
}

main();