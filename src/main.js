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
  
  // First, let's modify the vertex definition to create a simple quad instead of a cube
  
  // Define quad vertices (position and color)
  const vertices = new Float32Array([
    // Single quad with position and color
    -0.5, -0.5, 0.0,  1.0, 0.0, 0.0, // bottom-left, red
     0.5, -0.5, 0.0,  0.0, 1.0, 0.0, // bottom-right, green
     0.5,  0.5, 0.0,  0.0, 0.0, 1.0, // top-right, blue
    -0.5,  0.5, 0.0,  1.0, 1.0, 0.0, // top-left, yellow
  ]);

  // Define indices for the quad (2 triangles)
  const indices = new Uint16Array([
    0, 1, 2,  // first triangle
    2, 3, 0   // second triangle
  ]);

  // Create vertex buffer (same as before)
  const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  // Create index buffer (same as before)
  const indexBuffer = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  // Create a uniform buffer for the transformation matrix
  const uniformBufferSize = 4 * 4 * 4; // 4x4 matrix of 4-byte floats
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Create the shader module
  const shaderModule = device.createShaderModule({
    code: `
      struct Uniforms {
        transform: mat4x4<f32>,
      }

      @binding(0) @group(0) var<uniform> uniforms : Uniforms;

      struct VertexInput {
        @location(0) position : vec3<f32>,
        @location(1) color : vec3<f32>,
      }

      struct VertexOutput {
        @builtin(position) position : vec4<f32>,
        @location(0) color : vec3<f32>,
      }

      @vertex
      fn vs_main(input: VertexInput) -> VertexOutput {
        var output : VertexOutput;
        output.position = uniforms.transform * vec4<f32>(input.position, 1.0);
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
        arrayStride: 6 * 4, // 6 floats (3 position, 3 color)
        attributes: [
          { // position
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
          },
          { // color
            shaderLocation: 1,
            offset: 3 * 4, // after position
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
    console.log("Rendering frame");
    // Simple model-view-projection matrix
    const aspect = canvas.width / canvas.height;
    const projectionMatrix = createProjectionMatrix(aspect);
    
    // Create view matrix with camera orbit controls
    const cameraDistance = 5.0;
    
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
      [0, 1, 0]                 // up vector
    );
    
    // Create billboard matrix - this will make the quad face the camera
    const billboardMatrix = createBillboardMatrix(cameraPos);
    
    // Multiply billboard with view matrix
    const mvMatrix = multiplyMatrices(viewMatrix, billboardMatrix);
    
    // Multiply with projection matrix
    const mvpMatrix = multiplyMatrices(projectionMatrix, mvMatrix);
    
    // Write the transformation matrix to the uniform buffer
    device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix);
    
    // Rest of rendering code...
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
    passEncoder.drawIndexed(6); // Drawing 6 indices (2 triangles) instead of 36
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
  function createBillboardMatrix(cameraPos) {
    // Calculate the direction from the billboard to the camera
    const direction = normalizeVector([
      cameraPos[0], 
      cameraPos[1], 
      cameraPos[2]
    ]);
    
    // Use the world up vector
    const worldUp = [0, 1, 0];
    
    // Calculate right vector (perpendicular to direction and worldUp)
    const right = normalizeVector(crossProduct(worldUp, direction));
    
    // Calculate the corrected up vector
    const up = crossProduct(direction, right);
    
    // Create a rotation matrix that makes the quad face the camera
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

main();