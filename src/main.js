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
      alphaMode: 'opaque',
  });

  return { device, context, format };
}

async function main() {
  const { device, context, format } = await initWebGPU();
  
  // Define cube vertices (position and color)
  const vertices = new Float32Array([
    // Front face
    -0.5, -0.5,  0.5, 1.0, 0.0, 0.0, // bottom-left, red
     0.5, -0.5,  0.5, 0.0, 1.0, 0.0, // bottom-right, green
     0.5,  0.5,  0.5, 0.0, 0.0, 1.0, // top-right, blue
    -0.5,  0.5,  0.5, 1.0, 1.0, 0.0, // top-left, yellow
    // Back face
    -0.5, -0.5, -0.5, 1.0, 0.0, 1.0, // bottom-left, magenta
     0.5, -0.5, -0.5, 0.0, 1.0, 1.0, // bottom-right, cyan
     0.5,  0.5, -0.5, 1.0, 1.0, 1.0, // top-right, white
    -0.5,  0.5, -0.5, 0.5, 0.5, 0.5, // top-left, gray
  ]);

  // Define indices for the cube faces
  const indices = new Uint16Array([
    // front
    0, 1, 2, 2, 3, 0,
    // right
    1, 5, 6, 6, 2, 1,
    // back
    5, 4, 7, 7, 6, 5,
    // left
    4, 0, 3, 3, 7, 4,
    // top
    3, 2, 6, 6, 7, 3,
    // bottom
    4, 5, 1, 1, 0, 4
  ]);

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
      cullMode: 'back',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  });

  // Create depth texture
  const canvas = document.getElementById('webgpu-canvas');
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
    // Calculate time-based rotation
    const now = Date.now() / 1000;
    
    // Simple model-view-projection matrix
    const aspect = canvas.width / canvas.height;
    const projectionMatrix = createProjectionMatrix(aspect);
    
    // Create a simple rotation matrix for the model
    const viewMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, -5, 1, // move back 5 units
    ]);
    
    // Rotate around Y axis
    const modelMatrix = new Float32Array([
      Math.cos(now), 0, Math.sin(now), 0,
      0, 1, 0, 0,
      -Math.sin(now), 0, Math.cos(now), 0,
      0, 0, 0, 1,
    ]);
    
    // Create a proper MVP matrix
    const mvpMatrix = new Float32Array([
      // Column 1
      viewMatrix[0] * modelMatrix[0] + viewMatrix[4] * modelMatrix[1] + viewMatrix[8] * modelMatrix[2] + viewMatrix[12] * modelMatrix[3],
      viewMatrix[1] * modelMatrix[0] + viewMatrix[5] * modelMatrix[1] + viewMatrix[9] * modelMatrix[2] + viewMatrix[13] * modelMatrix[3],
      viewMatrix[2] * modelMatrix[0] + viewMatrix[6] * modelMatrix[1] + viewMatrix[10] * modelMatrix[2] + viewMatrix[14] * modelMatrix[3],
      viewMatrix[3] * modelMatrix[0] + viewMatrix[7] * modelMatrix[1] + viewMatrix[11] * modelMatrix[2] + viewMatrix[15] * modelMatrix[3],
      // Column 2
      viewMatrix[0] * modelMatrix[4] + viewMatrix[4] * modelMatrix[5] + viewMatrix[8] * modelMatrix[6] + viewMatrix[12] * modelMatrix[7],
      viewMatrix[1] * modelMatrix[4] + viewMatrix[5] * modelMatrix[5] + viewMatrix[9] * modelMatrix[6] + viewMatrix[13] * modelMatrix[7],
      viewMatrix[2] * modelMatrix[4] + viewMatrix[6] * modelMatrix[5] + viewMatrix[10] * modelMatrix[6] + viewMatrix[14] * modelMatrix[7],
      viewMatrix[3] * modelMatrix[4] + viewMatrix[7] * modelMatrix[5] + viewMatrix[11] * modelMatrix[6] + viewMatrix[15] * modelMatrix[7],
      // Column 3
      viewMatrix[0] * modelMatrix[8] + viewMatrix[4] * modelMatrix[9] + viewMatrix[8] * modelMatrix[10] + viewMatrix[12] * modelMatrix[11],
      viewMatrix[1] * modelMatrix[8] + viewMatrix[5] * modelMatrix[9] + viewMatrix[9] * modelMatrix[10] + viewMatrix[13] * modelMatrix[11],
      viewMatrix[2] * modelMatrix[8] + viewMatrix[6] * modelMatrix[9] + viewMatrix[10] * modelMatrix[10] + viewMatrix[14] * modelMatrix[11],
      viewMatrix[3] * modelMatrix[8] + viewMatrix[7] * modelMatrix[9] + viewMatrix[11] * modelMatrix[10] + viewMatrix[15] * modelMatrix[11],
      // Column 4
      viewMatrix[0] * modelMatrix[12] + viewMatrix[4] * modelMatrix[13] + viewMatrix[8] * modelMatrix[14] + viewMatrix[12] * modelMatrix[15],
      viewMatrix[1] * modelMatrix[12] + viewMatrix[5] * modelMatrix[13] + viewMatrix[9] * modelMatrix[14] + viewMatrix[13] * modelMatrix[15],
      viewMatrix[2] * modelMatrix[12] + viewMatrix[6] * modelMatrix[13] + viewMatrix[10] * modelMatrix[14] + viewMatrix[14] * modelMatrix[15],
      viewMatrix[3] * modelMatrix[12] + viewMatrix[7] * modelMatrix[13] + viewMatrix[11] * modelMatrix[14] + viewMatrix[15] * modelMatrix[15],
    ]);

    // Multiply by projection matrix (simplified for this example)
    const finalMatrix = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += projectionMatrix[i + k * 4] * mvpMatrix[k + j * 4];
        }
        finalMatrix[i + j * 4] = sum;
      }
    }
    
    // Write the transformation matrix to the uniform buffer
    device.queue.writeBuffer(uniformBuffer, 0, finalMatrix);

    // Start encoding commands
    const commandEncoder = device.createCommandEncoder();
    
    // Begin render pass
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
    
    // Set pipeline and bind group
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    
    // Set vertex and index buffers
    passEncoder.setVertexBuffer(0, vertexBuffer);
    passEncoder.setIndexBuffer(indexBuffer, 'uint16');
    
    // Draw the cube
    passEncoder.drawIndexed(36); // 6 faces * 2 triangles * 3 vertices
    
    // End the render pass and submit the command buffer
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
    
    // Request next frame
    requestAnimationFrame(frame);
  }
  
  // Start the animation loop
  requestAnimationFrame(frame);
}

main();