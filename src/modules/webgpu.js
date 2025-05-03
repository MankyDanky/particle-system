export async function initWebGPU() {
  if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
  }

  const canvas = document.getElementById('webgpu-canvas');
  
  // Set canvas size to match window dimensions
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  const context = canvas.getContext('webgpu');
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device: device,
    format: format,
    alphaMode: 'premultiplied',
  });

  return { device, context, format, canvas };
}

export function createRenderTextures(device, format, width, height) {
  const sceneTexture = device.createTexture({
    size: [width, height],
    format: format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    mipLevelCount: 1,
    sampleCount: 1
  });

  const bloomTexA = device.createTexture({
    size: [width, height],
    format: format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    mipLevelCount: 1,
    sampleCount: 1
  });

  const bloomTexB = device.createTexture({
    size: [width, height],
    format: format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    mipLevelCount: 1,
    sampleCount: 1
  });

  return { sceneTexture, bloomTexA, bloomTexB };
}

export function createDepthTexture(device, width, height) {
  return device.createTexture({
    size: [width, height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

export function createBuffer(device, data, usage) {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usage,
    mappedAtCreation: true,
  });
  
  const bufferData = new data.constructor(buffer.getMappedRange());
  bufferData.set(data);
  buffer.unmap();
  
  return buffer;
}