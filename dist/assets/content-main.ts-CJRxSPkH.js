(function(){const w=[],S={log:console.log,info:console.info,warn:console.warn,error:console.error,debug:console.debug};function X(d,s){const r={level:d,message:s.map(n=>typeof n=="string"?n:JSON.stringify(n)).join(" "),timestamp:Date.now(),args:s.map(n=>{try{return JSON.parse(JSON.stringify(n))}catch{return String(n)}})};w.length>=50&&w.shift(),w.push(r),chrome.runtime.sendMessage({type:"CONSOLE_ENTRY",data:r}).catch(()=>{})}function N(){const d=["log","info","warn","error","debug"];for(const s of d)console[s]=(...r)=>{X(s,r),S[s].apply(console,r)}}function L(){return[...w]}const M=50,T=[];function E(d){T.length>=M&&T.shift(),T.push(d),chrome.runtime.sendMessage({type:"NETWORK_ENTRY",data:d}).catch(()=>{})}function Y(){new PerformanceObserver(s=>{for(const r of s.getEntries()){const n=r;E({url:n.name,method:"GET",status:0,statusText:"",duration:Math.round(n.duration),timestamp:Math.round(performance.timeOrigin+n.startTime),headers:{}})}}).observe({entryTypes:["resource"]})}function C(){const d=window.fetch;window.fetch=async(s,r)=>{const n=typeof s=="string"?s:s instanceof URL?s.href:s.url,a=(r==null?void 0:r.method)??"GET",e=Date.now();try{const c=await d(s,r);return E({url:n,method:a.toUpperCase(),status:c.status,statusText:c.statusText,duration:Date.now()-e,timestamp:e,headers:{}}),c}catch(c){throw E({url:n,method:a.toUpperCase(),status:0,statusText:"Network Error",duration:Date.now()-e,timestamp:e,headers:{}}),c}}}function R(){const d=window.XMLHttpRequest,s=d.prototype.open,r=d.prototype.send;d.prototype.open=function(n,a){return this._bugspotter={method:n.toUpperCase(),url:String(a),start:0},s.apply(this,arguments)},d.prototype.send=function(){return this._bugspotter&&(this._bugspotter.start=Date.now()),this.addEventListener("loadend",()=>{this._bugspotter&&E({url:this._bugspotter.url,method:this._bugspotter.method,status:this.status,statusText:this.statusText,duration:Date.now()-this._bugspotter.start,timestamp:this._bugspotter.start,headers:{}})}),r.apply(this,arguments)}}function _(){Y(),C(),R()}function O(){return[...T]}N();_();chrome.runtime.onMessage.addListener((d,s,r)=>d.type==="GET_CAPTURE_DATA"?(r({type:"CAPTURE_DATA",data:{console:L(),network:O()}}),!0):d.type==="START_ANNOTATION"?(I(d.screenshot),r({success:!0}),!0):!1);function I(d){const s=document.getElementById("bugspotter-annotation-host");s&&s.remove();const r=document.createElement("div");r.id="bugspotter-annotation-host",r.style.cssText="position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;";const n=r.attachShadow({mode:"closed"});n.innerHTML=`
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
  `,document.body.appendChild(r);const a=n.getElementById("annotation-canvas"),e=a.getContext("2d"),c=new Image;let h="rectangle",p="#ef4444",y=!1,m=0,v=0;const f=[],x=[];let u=[];function b(){e.clearRect(0,0,a.width,a.height),e.drawImage(c,0,0,a.width,a.height);for(const t of f)A(t)}function A(t){if(e.strokeStyle=t.color,e.fillStyle=t.color,e.lineWidth=3,t.type==="rectangle")e.strokeRect(t.startX,t.startY,t.endX-t.startX,t.endY-t.startY);else if(t.type==="arrow"){const o=t.endX-t.startX,l=t.endY-t.startY,i=Math.atan2(l,o),g=15;e.beginPath(),e.moveTo(t.startX,t.startY),e.lineTo(t.endX,t.endY),e.stroke(),e.beginPath(),e.moveTo(t.endX,t.endY),e.lineTo(t.endX-g*Math.cos(i-Math.PI/6),t.endY-g*Math.sin(i-Math.PI/6)),e.moveTo(t.endX,t.endY),e.lineTo(t.endX-g*Math.cos(i+Math.PI/6),t.endY-g*Math.sin(i+Math.PI/6)),e.stroke()}else if(t.type==="freehand"&&t.points){e.beginPath(),e.moveTo(t.points[0].x,t.points[0].y);for(let o=1;o<t.points.length;o++)e.lineTo(t.points[o].x,t.points[o].y);e.stroke()}else t.type==="text"&&t.text&&(e.font="16px system-ui, sans-serif",e.fillText(t.text,t.startX,t.startY))}c.onload=()=>{a.width=c.naturalWidth,a.height=c.naturalHeight,e.drawImage(c,0,0,a.width,a.height)},c.src=d;function k(t){const o=a.getBoundingClientRect();return{x:(t.clientX-o.left)*(a.width/o.width),y:(t.clientY-o.top)*(a.height/o.height)}}a.addEventListener("mousedown",t=>{const{x:o,y:l}=k(t);if(y=!0,m=o,v=l,h==="freehand"&&(u=[{x:o,y:l}]),h==="text"){y=!1;const i=prompt("Enter text:");if(i){const g={type:"text",color:p,startX:o,startY:l,endX:o,endY:l,text:i};f.push(g),x.length=0,b()}}}),a.addEventListener("mousemove",t=>{if(!y)return;const{x:o,y:l}=k(t);if(h==="freehand"){u.push({x:o,y:l}),b(),e.strokeStyle=p,e.lineWidth=3,e.beginPath(),e.moveTo(u[0].x,u[0].y);for(let i=1;i<u.length;i++)e.lineTo(u[i].x,u[i].y);e.stroke()}else b(),A({type:h,color:p,startX:m,startY:v,endX:o,endY:l})}),a.addEventListener("mouseup",t=>{if(!y)return;y=!1;const{x:o,y:l}=k(t);h==="freehand"?f.push({type:"freehand",color:p,startX:m,startY:v,endX:o,endY:l,points:[...u]}):f.push({type:h,color:p,startX:m,startY:v,endX:o,endY:l}),x.length=0,b()}),n.querySelectorAll("[data-tool]").forEach(t=>{t.addEventListener("click",()=>{n.querySelectorAll("[data-tool]").forEach(o=>o.classList.remove("active")),t.classList.add("active"),h=t.dataset.tool})}),n.querySelectorAll("[data-color]").forEach(t=>{t.addEventListener("click",()=>{n.querySelectorAll("[data-color]").forEach(o=>o.classList.remove("active")),t.classList.add("active"),p=t.dataset.color})}),n.querySelector('[data-action="undo"]').addEventListener("click",()=>{const t=f.pop();t&&(x.push(t),b())}),n.querySelector('[data-action="redo"]').addEventListener("click",()=>{const t=x.pop();t&&(f.push(t),b())}),n.querySelector(".btn-done").addEventListener("click",()=>{a.toBlob(t=>{if(t){const o=new FileReader;o.onload=()=>{chrome.runtime.sendMessage({type:"ANNOTATION_DONE",data:o.result}),r.remove()},o.readAsDataURL(t)}},"image/png")}),n.querySelector(".btn-cancel").addEventListener("click",()=>{chrome.runtime.sendMessage({type:"ANNOTATION_CANCEL"}),r.remove()})}
})()
