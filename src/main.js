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
      alphaMode: 'opaque',
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
  
  // Add mouse event listeners
  const canvas = document.getElementById('webgpu-canvas');
  
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
  
  // Define billboard positions (offsets from origin)
  const billboardPositions = [
    [0, 0, 0],      // Center
    [2, 0, 0],      // Right
    [-2, 0, 0],     // Left
    [0, 2, 0],      // Top
    [0, -2, 0],     // Bottom
    [0, 0, 2],      // Front
    [0, 0, -2]      // Back
  ];
  
  // Define billboard size (add this near your billboard positions)
  const size = 0.5;
  
  // Create all billboards
  const { vertices, indices } = createBillboards(billboardPositions);
  
  // Create vertex buffer 
  const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  // Create index buffer
  const indexBuffer = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);
  
  // Create a uniform buffer for the transformation matrix + camera position
  // The shader expects at least 80 bytes, so we'll create a buffer of that size
  const uniformBufferSize = 80; // Aligned size for MVP matrix + camera position
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Create the shader module with improved billboarding
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
      }

      struct VertexOutput {
        @builtin(position) position : vec4<f32>,
        @location(0) color : vec3<f32>,
      }

      @vertex
      fn vs_main(input: VertexInput) -> VertexOutput {
        var output : VertexOutput;
        
        // Get the billboard center position in world space
        let center = input.centerPosition;
        
        // First, transform the billboard center to view space (camera space)
        let viewCenter = uniforms.transform * vec4<f32>(center, 1.0);
        
        // Calculate the vertex position offset (still in local space)
        // This is the offset from the billboard center
        let localOffset = input.position - center;
        
        // Calculate final position in clip space by adding the local offset directly 
        // to the view-transformed center point, but only in screen space (x,y)
        // Scale the offset by a factor to maintain consistent size regardless of depth
        let scaleFactor = 0.15;  // Adjust this to control billboard size
        
        // Add the offset directly to the clip space position
        // This is the key to proper billboarding - we add local offsets in screen/clip space
        let aspectCorrection = uniforms.aspectRatio;
        let finalPosition = vec4<f32>(
          viewCenter.x + localOffset.x * scaleFactor * viewCenter.w,
          viewCenter.y + localOffset.y * scaleFactor * aspectCorrection * viewCenter.w,
          viewCenter.z,
          viewCenter.w
        );
        
        output.position = finalPosition;
        output.color = input.color;
        return output;
      }

      @fragment
      fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
        return vec4<f32>(input.color, 1.0);
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

  // Create the render pipeline
  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
      buffers: [{
        arrayStride: 9 * 4, // 9 floats (3 position, 3 color, 3 center)
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
        ],
      }],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{
        format: format,
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

  // Create depth texture
  const depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
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
  function frame() {
    const aspect = canvas.width / canvas.height;
    const projectionMatrix = createProjectionMatrix(aspect);
    
    // Calculate camera position based on spherical coordinates
    const cameraDistance = 10.0;
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
    passEncoder.drawIndexed(indices.length);
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
  
  // Helper function to create a billboard matrix (always faces camera)
  function createBillboardRotation(cameraPos) {
    // Calculate the direction from origin toward the camera
    const direction = normalizeVector([
      -cameraPos[0],  // Negate to make it point toward the camera
      -cameraPos[1], 
      -cameraPos[2]
    ]);
    
    // Use the world up vector
    const worldUp = [0, 1, 0];
    
    // Calculate right vector (perpendicular to direction and worldUp)
    const right = normalizeVector(crossProduct(worldUp, direction));
    
    // Calculate the corrected up vector (to ensure orthogonality)
    const up = normalizeVector(crossProduct(direction, right));
    
    // Create a rotation matrix that aligns with the camera view
    return new Float32Array([
      right[0], right[1], right[2], 0,
      up[0], up[1], up[2], 0,
      direction[0], direction[1], direction[2], 0,
      0, 0, 0, 1
    ]);
  }

  // Start the animation loop
  requestAnimationFrame(frame);
}

// Function to create multiple billboards
function createBillboards(positions) {
  const size = 0.5;
  const allVertices = [];
  const allIndices = [];
  
  positions.forEach((pos, billboardIndex) => {
    const colors = [
      [1.0, 0.0, 0.0], // red
      [0.0, 1.0, 0.0], // green
      [0.0, 0.0, 1.0], // blue
      [1.0, 1.0, 0.0]  // yellow
    ];
    
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
      allVertices.push(colors[i][0]);
      allVertices.push(colors[i][1]);
      allVertices.push(colors[i][2]);
      
      // Billboard center (for GPU billboarding)
      allVertices.push(pos[0]);
      allVertices.push(pos[1]);
      allVertices.push(pos[2]);
    });
    
    // Add indices (same as before)
    const indexOffset = billboardIndex * 4;
    allIndices.push(indexOffset + 0, indexOffset + 1, indexOffset + 2);
    allIndices.push(indexOffset + 2, indexOffset + 3, indexOffset + 0);
  });
  
  return {
    vertices: new Float32Array(allVertices),
    indices: new Uint16Array(allIndices)
  };
}

// Add this new function to update billboard vertices for camera facing
function updateBillboardVertices(positions, billboardRotation, size = 0.5) {
  const allVertices = [];
  
  // For each position, create a billboard
  positions.forEach((pos, billboardIndex) => {
    // Each billboard has 4 vertices with different colors
    const colors = [
      [1.0, 0.0, 0.0], // red
      [0.0, 1.0, 0.0], // green
      [0.0, 0.0, 1.0], // blue
      [1.0, 1.0, 0.0]  // yellow
    ];
    
    // Create 4 vertices for this billboard (a quad)
    const corners = [
      [-size, -size, 0], // bottom-left
      [size, -size, 0],  // bottom-right
      [size, size, 0],   // top-right
      [-size, size, 0]   // top-left
    ];
    
    // Add vertices for this billboard
    corners.forEach((corner, i) => {
      // Apply billboard rotation to the corner offset
      const rotatedCorner = [
        billboardRotation[0] * corner[0] + billboardRotation[4] * corner[1] + billboardRotation[8] * corner[2],
        billboardRotation[1] * corner[0] + billboardRotation[5] * corner[1] + billboardRotation[9] * corner[2],
        billboardRotation[2] * corner[0] + billboardRotation[6] * corner[1] + billboardRotation[10] * corner[2]
      ];
      
      // Position (with offset)
      allVertices.push(rotatedCorner[0] + pos[0]); // x
      allVertices.push(rotatedCorner[1] + pos[1]); // y
      allVertices.push(rotatedCorner[2] + pos[2]); // z
      
      // Color
      allVertices.push(colors[i][0]);
      allVertices.push(colors[i][1]);
      allVertices.push(colors[i][2]);
    });
  });
  
  return new Float32Array(allVertices);
}

main();