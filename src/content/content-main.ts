import { initConsoleCapture, getConsoleLogs } from './console-capture';
import { initNetworkCapture, getNetworkRequests } from './network-capture';

initConsoleCapture();
initNetworkCapture();

// Listen for messages from service worker / popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_CAPTURE_DATA') {
    sendResponse({
      type: 'CAPTURE_DATA',
      data: {
        console: getConsoleLogs(),
        network: getNetworkRequests(),
      },
    });
    return true;
  }

  if (message.type === 'START_ANNOTATION') {
    injectAnnotationOverlay(message.screenshot);
    sendResponse({ success: true });
    return true;
  }

  return false;
});

function injectAnnotationOverlay(screenshotDataUrl: string) {
  // Remove existing overlay if any
  const existing = document.getElementById('bugspotter-annotation-host');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = 'bugspotter-annotation-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.8); display: flex; flex-direction: column; align-items: center; font-family: system-ui, sans-serif; }
      .toolbar { display: flex; gap: 8px; padding: 12px; background: #1f2937; border-radius: 8px; margin-top: 12px; align-items: center; }
      .toolbar button { padding: 6px 12px; border: 1px solid #4b5563; border-radius: 4px; background: #374151; color: white; cursor: pointer; font-size: 13px; }
      .toolbar button.active { background: #2563eb; border-color: #3b82f6; }
      .toolbar button:hover { background: #4b5563; }
      .toolbar button.active:hover { background: #1d4ed8; }
      .color-btn { width: 24px; height: 24px; border-radius: 50%; border: 2px solid #4b5563; cursor: pointer; padding: 0; }
      .color-btn.active { border-color: white; }
      .canvas-container { flex: 1; display: flex; align-items: center; justify-content: center; padding: 12px; overflow: hidden; }
      canvas { max-width: 100%; max-height: 100%; cursor: crosshair; }
      .actions { display: flex; gap: 8px; padding: 12px; }
      .actions button { padding: 8px 20px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600; }
      .btn-done { background: #22c55e; color: white; }
      .btn-done:hover { background: #16a34a; }
      .btn-cancel { background: #ef4444; color: white; }
      .btn-cancel:hover { background: #dc2626; }
    </style>
    <div class="overlay">
      <div class="toolbar">
        <button data-tool="rectangle" class="active">Rectangle</button>
        <button data-tool="arrow">Arrow</button>
        <button data-tool="freehand">Freehand</button>
        <button data-tool="text">Text</button>
        <span style="width:1px;height:24px;background:#4b5563;margin:0 4px;"></span>
        <button class="color-btn active" data-color="#ef4444" style="background:#ef4444;"></button>
        <button class="color-btn" data-color="#22c55e" style="background:#22c55e;"></button>
        <button class="color-btn" data-color="#3b82f6" style="background:#3b82f6;"></button>
        <button class="color-btn" data-color="#eab308" style="background:#eab308;"></button>
        <button class="color-btn" data-color="#ffffff" style="background:#ffffff;"></button>
        <button class="color-btn" data-color="#000000" style="background:#000000;"></button>
        <span style="width:1px;height:24px;background:#4b5563;margin:0 4px;"></span>
        <button data-action="undo">Undo</button>
        <button data-action="redo">Redo</button>
      </div>
      <div class="canvas-container">
        <canvas id="annotation-canvas"></canvas>
      </div>
      <div class="actions">
        <button class="btn-done">Done</button>
        <button class="btn-cancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(host);

  // Initialize canvas with screenshot
  const canvas = shadow.getElementById('annotation-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const img = new Image();

  let currentTool = 'rectangle';
  let currentColor = '#ef4444';
  let isDrawing = false;
  let startX = 0;
  let startY = 0;

  interface DrawAction {
    type: string;
    color: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    points?: { x: number; y: number }[];
    text?: string;
  }

  const undoStack: DrawAction[] = [];
  const redoStack: DrawAction[] = [];
  let currentFreehand: { x: number; y: number }[] = [];

  function redrawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const action of undoStack) {
      drawAction(action);
    }
  }

  function drawAction(action: DrawAction) {
    ctx.strokeStyle = action.color;
    ctx.fillStyle = action.color;
    ctx.lineWidth = 3;

    if (action.type === 'rectangle') {
      ctx.strokeRect(
        action.startX, action.startY,
        action.endX - action.startX, action.endY - action.startY
      );
    } else if (action.type === 'arrow') {
      const dx = action.endX - action.startX;
      const dy = action.endY - action.startY;
      const angle = Math.atan2(dy, dx);
      const headLen = 15;

      ctx.beginPath();
      ctx.moveTo(action.startX, action.startY);
      ctx.lineTo(action.endX, action.endY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(action.endX, action.endY);
      ctx.lineTo(action.endX - headLen * Math.cos(angle - Math.PI / 6), action.endY - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(action.endX, action.endY);
      ctx.lineTo(action.endX - headLen * Math.cos(angle + Math.PI / 6), action.endY - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    } else if (action.type === 'freehand' && action.points) {
      ctx.beginPath();
      ctx.moveTo(action.points[0].x, action.points[0].y);
      for (let i = 1; i < action.points.length; i++) {
        ctx.lineTo(action.points[i].x, action.points[i].y);
      }
      ctx.stroke();
    } else if (action.type === 'text' && action.text) {
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(action.text, action.startX, action.startY);
    }
  }

  img.onload = () => {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  img.src = screenshotDataUrl;

  function getCanvasCoords(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    const { x, y } = getCanvasCoords(e);
    isDrawing = true;
    startX = x;
    startY = y;

    if (currentTool === 'freehand') {
      currentFreehand = [{ x, y }];
    }
    if (currentTool === 'text') {
      isDrawing = false;
      const text = prompt('Enter text:');
      if (text) {
        const action: DrawAction = { type: 'text', color: currentColor, startX: x, startY: y, endX: x, endY: y, text };
        undoStack.push(action);
        redoStack.length = 0;
        redrawAll();
      }
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const { x, y } = getCanvasCoords(e);

    if (currentTool === 'freehand') {
      currentFreehand.push({ x, y });
      redrawAll();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(currentFreehand[0].x, currentFreehand[0].y);
      for (let i = 1; i < currentFreehand.length; i++) {
        ctx.lineTo(currentFreehand[i].x, currentFreehand[i].y);
      }
      ctx.stroke();
    } else {
      redrawAll();
      const preview: DrawAction = { type: currentTool, color: currentColor, startX, startY, endX: x, endY: y };
      drawAction(preview);
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const { x, y } = getCanvasCoords(e);

    if (currentTool === 'freehand') {
      undoStack.push({ type: 'freehand', color: currentColor, startX, startY, endX: x, endY: y, points: [...currentFreehand] });
    } else {
      undoStack.push({ type: currentTool, color: currentColor, startX, startY, endX: x, endY: y });
    }
    redoStack.length = 0;
    redrawAll();
  });

  // Toolbar handlers
  shadow.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      shadow.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTool = btn.dataset.tool!;
    });
  });

  shadow.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((btn) => {
    btn.addEventListener('click', () => {
      shadow.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentColor = btn.dataset.color!;
    });
  });

  shadow.querySelector('[data-action="undo"]')!.addEventListener('click', () => {
    const action = undoStack.pop();
    if (action) {
      redoStack.push(action);
      redrawAll();
    }
  });

  shadow.querySelector('[data-action="redo"]')!.addEventListener('click', () => {
    const action = redoStack.pop();
    if (action) {
      undoStack.push(action);
      redrawAll();
    }
  });

  shadow.querySelector('.btn-done')!.addEventListener('click', () => {
    canvas.toBlob((blob) => {
      if (blob) {
        const reader = new FileReader();
        reader.onload = () => {
          chrome.runtime.sendMessage({ type: 'ANNOTATION_DONE', data: reader.result as string });
          host.remove();
        };
        reader.readAsDataURL(blob);
      }
    }, 'image/png');
  });

  shadow.querySelector('.btn-cancel')!.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'ANNOTATION_CANCEL' });
    host.remove();
  });
}
