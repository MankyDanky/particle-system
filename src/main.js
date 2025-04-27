import "./style.css";

async function initWebGPU() {
  if (!navigator.gpu) {
      throw new Error("WebGPU not supported on this browser.");
  }

  const canvas = document.getElementById('webgpu-canvas');
  const context = canvas.getContext('webgpu');
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const format = navigator.gpu.getPreferredCanvasFormat();

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  
  resizeCanvas();
  
  context.configure({
    device: device,
    format: format,
    alphaMode: 'opaque',
  });

  return { device, context, format, canvas, resizeCanvas };
}

async function createPipeline(device, format, canvas) {
  const shaderModule = device.createShaderModule({
    label: "Triangle shader",
    code: `
      // Vertex shader
      @vertex
      fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
        var positions = array<vec2f, 3>(
          vec2f(0.0, 0.5),   // Top center
          vec2f(-0.5, -0.5), // Bottom left
          vec2f(0.5, -0.5)   // Bottom right
        );
        
        // Account for aspect ratio to prevent stretching
        let aspectRatio = ${canvas.width / canvas.height};
        var position = positions[vertexIndex];
        
        position.x = position.x * 1.3/ aspectRatio;
        
        return vec4f(position, 0.0, 1.0);
      }
      
      // Fragment shader
      @fragment
      fn fragmentMain() -> @location(0) vec4f {
        return vec4f(1.0, 0.0, 0.0, 1.0); // Red color
      }
    `
  });
  
  const pipeline = device.createRenderPipeline({
    label: "Triangle pipeline",
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: "vertexMain"
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fragmentMain",
      targets: [{ format }]
    },
    primitive: {
      topology: "triangle-list"
    }
  });
  
  return pipeline;
}

function render(device, context, pipeline) {
  const commandEncoder = device.createCommandEncoder();
  
  const renderPassDescriptor = {
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      loadOp: "clear",
      clearValue: { r: 0.0, g: 0.0, b: 0.2, a: 1.0 },
      storeOp: "store"
    }]
  };
  
  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.draw(3); 
  passEncoder.end();
  
  device.queue.submit([commandEncoder.finish()]);
}

async function main() {
  const { device, context, format, canvas, resizeCanvas } = await initWebGPU();
  let pipeline = await createPipeline(device, format, canvas);
  
  window.addEventListener('resize', async () => {
    resizeCanvas();
    context.configure({
      device: device,
      format: format,
      alphaMode: 'opaque',
    });
    
    pipeline = await createPipeline(device, format, canvas);
  });
  
  function frame() {
    render(device, context, pipeline);
    requestAnimationFrame(frame);
  }
  
  frame();
}

main();