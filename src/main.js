import "./style.css"

async function initWebGPU() {
  if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
  }

  // In your initWebGPU function, make sure the canvas is properly sized
  const canvas = document.getElementById('webgpu-canvas');

  const context = canvas.getContext('webgpu');

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();

  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
      device: device,
      format: format,
      alphaMode: 'premultiplied',  // Change from 'opaque' to 'premultiplied' for transparency
  });

  return { device, context, format };
}

async function main() {
  const { device, context, format } = await initWebGPU();
  
  // Add camera control variables
  let cameraRotationX = 0;
  let cameraRotationY = 0;
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  const rotationSpeed = 0.01;
  
  // Add zoom control variables
  let cameraDistance = 10.0; // Initial camera distance
  const minZoom = 3.0;       // Minimum zoom distance
  const maxZoom = 20.0;      // Maximum zoom distance
  const zoomSpeed = 0.5;     // How fast zooming occurs
  
  // Define the size of each billboard
  const size = 0.5;
  
  // Add particle system state - make particleCount variable instead of constant
  let particleCount = 50; // Initial particle count, now variable
  let particles = [];
  let lastTime = performance.now();
  
  // Get canvas reference
  const canvas = document.getElementById('webgpu-canvas');
  
  // Set canvas size to match window size
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  // Create depth texture first (before any function tries to use it)
  let depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  
  // Function to resize canvas and resources
  function resizeCanvasToDisplaySize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Recreate depth texture with new size
    depthTexture.destroy();
    depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }
  
  // Add resize event listener
  window.addEventListener('resize', resizeCanvasToDisplaySize);
  
  // Get UI elements
  const lifetimeSlider = document.getElementById('lifetime-slider');
  const lifetimeValue = document.getElementById('lifetime-value');
  const countSlider = document.getElementById('count-slider');
  const countValue = document.getElementById('count-value');
  
  // Update lifetime value display when slider changes
  lifetimeSlider.addEventListener('input', () => {
    const value = lifetimeSlider.value;
    lifetimeValue.textContent = `${value} sec`;
  });
  
  // Update count value display when slider changes
  countSlider.addEventListener('input', () => {
    const value = countSlider.value;
    countValue.textContent = value;
    particleCount = parseInt(value);
  });

  // Create respawn button listener
  const respawnButton = document.getElementById('respawn-button');
  respawnButton.addEventListener('click', () => {
    spawnParticles();
  });
  
  // Add mouse event listeners
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
  
  // Add wheel event listener for zooming (after your other mouse event listeners)
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); // Prevent page scrolling
    
    // Determine zoom direction (positive = zoom out, negative = zoom in)
    const zoomAmount = e.deltaY * 0.01; // Adjust multiplier for sensitivity
    
    // Update camera distance with constraints
    cameraDistance = Math.max(minZoom, Math.min(maxZoom, cameraDistance + zoomAmount));
    
    // Optional: log the current zoom level
    console.log(`Camera distance: ${cameraDistance.toFixed(2)}`);
  });
  
  // Set up buffers with max capacity - define MAX_PARTICLES as a constant for the upper limit
  const MAX_PARTICLES = 1000; // Maximum possible particles (matches slider max)
  
  // Create vertex buffer with capacity for maximum particles
  const vertexBuffer = device.createBuffer({
    size: MAX_PARTICLES * 4 * 10 * 4, // MAX_PARTICLES * 4 vertices per quad * 10 floats per vertex * 4 bytes per float
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  
  // Create index buffer with capacity for maximum particles
  const indexBuffer = device.createBuffer({
    size: MAX_PARTICLES * 6 * 2, // MAX_PARTICLES * 6 indices per quad (2 triangles) * 2 bytes per index (uint16)
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  
  // Track how many indices to draw
  let indexCount = 0;
  
  // Function to spawn particles
  function spawnParticles() {
    particles = [];
    // Get the base lifetime from the slider
    const baseLifetime = parseFloat(lifetimeSlider.value);
    
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        position: [
          (Math.random() - 0.5) * 10, // Random position between -5 and 5
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        ],
        lifetime: baseLifetime + Math.random() * 2 - 1, // Base lifetime plus some randomness
        age: 0,
        color: [
          Math.random(), // Random RGB color
          Math.random(),
          Math.random()
        ]
      });
    }
    updateBuffers();
  }
  
  // Function to update vertex and index buffers
  function updateBuffers() {
    const { vertices, indices } = createBillboardsFromParticles(particles);
    device.queue.writeBuffer(vertexBuffer, 0, vertices);
    device.queue.writeBuffer(indexBuffer, 0, indices);
    indexCount = indices.length;
  }
  
  // Initialize with particles (moved to after buffer creation)
  spawnParticles();

  // Create a uniform buffer for the transformation matrix + camera position
  // The shader expects at least 80 bytes, so we'll create a buffer of that size
  const uniformBufferSize = 80; // Aligned size for MVP matrix + camera position
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Update the shader module code to use distance-based scaling

  const shaderModule = device.createShaderModule({
    code: `
      struct Uniforms {
        transform: mat4x4<f32>,
        cameraPosition: vec3<f32>,
        aspectRatio: f32,  // Canvas width/height
      }

      @binding(0) @group(0) var<uniform> uniforms : Uniforms;

      struct VertexInput {
        @location(0) position : vec3<f32>,
        @location(1) color : vec3<f32>,
        @location(2) centerPosition : vec3<f32>,
        @location(3) alpha : f32,
      }

      struct VertexOutput {
        @builtin(position) position : vec4<f32>,
        @location(0) color : vec3<f32>,
        @location(1) alpha : f32,
      }

      @vertex
      fn vs_main(input: VertexInput) -> VertexOutput {
        var output : VertexOutput;
        
        // Get the billboard center position in world space
        let center = input.centerPosition;
        
        // First, transform the billboard center to view space (camera space)
        let viewCenter = uniforms.transform * vec4<f32>(center, 1.0);
        
        // Calculate distance to camera (for size scaling)
        let cameraToParticle = length(center - uniforms.cameraPosition);
        
        // Calculate the vertex position offset (still in local space)
        // This is the offset from the billboard center
        let localOffset = input.position - center;
        
        // Calculate size scaling factor - adjust multipliers to taste
        // 0.15 is the base size when at reference distance (10.0)
        let baseScaleFactor = 0.15;
        
        // This makes particles appear smaller as you zoom out and larger as you zoom in
        // The division by 10.0 represents a "reference distance" where particle is at base size
        let distanceScaleFactor = baseScaleFactor * (10.0 / cameraToParticle);
        
        // Add the offset directly to the clip space position
        let aspectCorrection = uniforms.aspectRatio;
        let finalPosition = vec4<f32>(
          viewCenter.x + localOffset.x * distanceScaleFactor * viewCenter.w,
          viewCenter.y + localOffset.y * distanceScaleFactor * aspectCorrection * viewCenter.w,
          viewCenter.z,
          viewCenter.w
        );
        
        output.position = finalPosition;
        output.color = input.color;
        output.alpha = input.alpha;
        return output;
      }

      @fragment
      fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
        return vec4<f32>(input.color, input.alpha);
      }
    `,
  });

  // Create the pipeline layout
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

  // Create the render pipeline with alpha blending
  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
      buffers: [{
        arrayStride: 10 * 4, // 10 floats (3 position, 3 color, 3 center, 1 alpha)
        attributes: [
          { // position
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
          },
          { // color
            shaderLocation: 1,
            offset: 3 * 4,
            format: 'float32x3',
          },
          { // billboard center
            shaderLocation: 2,
            offset: 6 * 4,
            format: 'float32x3',
          },
          { // alpha (transparency)
            shaderLocation: 3,
            offset: 9 * 4,
            format: 'float32',
          },
        ],
      }],
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
      cullMode: 'none',  // Change to 'none' to see both sides of the quad
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  });

  // Create bind group
  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{
      binding: 0,
      resource: { buffer: uniformBuffer },
    }],
  });

  // Initialize transformation matrix (perspective projection * view * model)
  function createProjectionMatrix(aspect) {
    const fov = Math.PI / 4; // 45 degrees
    const near = 0.1;
    const far = 100.0;
    
    const f = 1.0 / Math.tan(fov / 2);
    
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) / (near - far), -1,
      0, 0, (2 * far * near) / (near - far), 0,
    ]);
  }

  // Animation loop
  function frame(currentTime) {
    // Calculate delta time in seconds
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    // Update particle ages
    let needsUpdate = false;
    for (let i = 0; i < particles.length; i++) {
      particles[i].age += deltaTime;
      // Flag for update if any particle age changed significantly
      if (particles[i].age % 0.1 < deltaTime) {
        needsUpdate = true;
      }
    }
    
    // Update buffers if needed (only when alpha changes significantly)
    if (needsUpdate) {
      updateBuffers();
    }
    
    const aspect = canvas.width / canvas.height;
    const projectionMatrix = createProjectionMatrix(aspect);
    
    // Calculate camera position based on spherical coordinates
    const cameraX = cameraDistance * Math.sin(cameraRotationY) * Math.cos(cameraRotationX);
    const cameraY = cameraDistance * Math.sin(cameraRotationX);
    const cameraZ = cameraDistance * Math.cos(cameraRotationY) * Math.cos(cameraRotationX);
    
    // Camera position vector
    const cameraPos = [cameraX, cameraY, cameraZ];
    
    // Create a look-at view matrix
    const viewMatrix = createLookAtMatrix(
      cameraPos,                // camera position
      [0, 0, 0],                // target (looking at origin)
      [0, 1, 0]                 // world up vector
    );
    
    // Create a combined view-projection matrix
    const mvpMatrix = multiplyMatrices(projectionMatrix, viewMatrix);
    
    // Write MVP matrix to the uniform buffer
    device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix);
    
    // Create a Float32Array with camera position and aspect ratio
    const cameraData = new Float32Array([cameraX, cameraY, cameraZ, aspect]);
    
    // Write camera position and aspect at the correct offset
    device.queue.writeBuffer(uniformBuffer, 64, cameraData);
    
    // Rest of rendering code (unchanged)...
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
    passEncoder.setVertexBuffer(0, vertexBuffer);
    passEncoder.setIndexBuffer(indexBuffer, 'uint16');
    
    // Only draw if we have particles
    if (indexCount > 0) {
      passEncoder.drawIndexed(indexCount);
    }
    
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
    
    requestAnimationFrame(frame);
  }
  
  // Helper function to create a look-at matrix
  function createLookAtMatrix(eye, target, up) {
    // Calculate forward (z), right (x), and up (y) vectors
    const zAxis = normalizeVector([
      eye[0] - target[0],
      eye[1] - target[1],
      eye[2] - target[2]
    ]);
    
    const xAxis = normalizeVector(crossProduct(up, zAxis));
    const yAxis = crossProduct(zAxis, xAxis);
    
    // Create the view matrix
    return new Float32Array([
      xAxis[0], yAxis[0], zAxis[0], 0,
      xAxis[1], yAxis[1], zAxis[1], 0,
      xAxis[2], yAxis[2], zAxis[2], 0,
      -dotProduct(xAxis, eye), -dotProduct(yAxis, eye), -dotProduct(zAxis, eye), 1
    ]);
  }
  
  // Vector helper functions
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
  
  // Matrix multiplication function
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
  
  // Helper function to create billboards from particles
  function createBillboardsFromParticles(particles) {
    const allVertices = [];
    const allIndices = [];
    
    particles.forEach((particle, particleIndex) => {
      const pos = particle.position;
      
      // Calculate alpha based on age (fade out as it gets older)
      const lifeRatio = particle.age / particle.lifetime;
      const alpha = Math.max(0, 1.0 - lifeRatio); // Fade out over lifetime
      
      // Skip particles that are completely transparent
      if (alpha <= 0.01) return;
      
      // Base particle color
      const r = particle.color[0];
      const g = particle.color[1];
      const b = particle.color[2];
      
      const corners = [
        [-size, -size, 0], // bottom-left
        [size, -size, 0],  // bottom-right
        [size, size, 0],   // top-right
        [-size, size, 0]   // top-left
      ];
      
      // Add vertices for this billboard
      corners.forEach((corner, i) => {
        // Position (with offset)
        allVertices.push(corner[0] + pos[0]); // x
        allVertices.push(corner[1] + pos[1]); // y
        allVertices.push(corner[2] + pos[2]); // z
        
        // Color
        allVertices.push(r);
        allVertices.push(g);
        allVertices.push(b);
        
        // Billboard center (for GPU billboarding)
        allVertices.push(pos[0]);
        allVertices.push(pos[1]);
        allVertices.push(pos[2]);
        
        // Alpha (transparency)
        allVertices.push(alpha);
      });
      
      // Add indices for only the visible particles
      const indexOffset = allVertices.length / 10 - 4; // 10 values per vertex, 4 vertices per particle
      allIndices.push(indexOffset + 0, indexOffset + 1, indexOffset + 2);
      allIndices.push(indexOffset + 2, indexOffset + 3, indexOffset + 0);
    });
    
    return {
      vertices: new Float32Array(allVertices),
      indices: new Uint16Array(allIndices)
    };
  }

  // Start the animation loop
  lastTime = performance.now();
  requestAnimationFrame(frame);
}

// Add this function near the top of your main function:

main();