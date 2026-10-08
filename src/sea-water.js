// SeaScene's original water2.fsh. SpriteKit's implicit inputs are declared here.
// Native bg_node fills the scene; the browser's local boards omit native camera pan.
export class SeaWaterSurface {
  constructor(image,makeCanvas=()=>typeof document==='undefined'?null:document.createElement('canvas')){
    this.image=image;this.canvas=makeCanvas();this.gl=null;this.program=null;this.destroyed=false;
    if(!image||!this.canvas)return;
    try{this.gl=this.canvas.getContext('webgl',{alpha:false,preserveDrawingBuffer:true,antialias:false});}catch{this.gl=null;}
    if(!this.gl)return;
    this.ready=fetch('./assets/water2.fsh').then(r=>{if(!r.ok)throw new Error('Water shader unavailable');return r.text();}).then(source=>{if(!this.destroyed)this.initialize(source);}).catch(()=>{this.program=null;});
  }
  initialize(source){const gl=this.gl,compile=(type,code)=>{const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);throw new Error('Water shader compilation failed');}return shader;};
    const vertex=compile(gl.VERTEX_SHADER,'attribute vec2 a_position; varying vec2 v_tex_coord; void main(){v_tex_coord=(a_position+1.0)*0.5;gl_Position=vec4(a_position,0.0,1.0);}');
    const fragment=compile(gl.FRAGMENT_SHADER,'precision mediump float; varying vec2 v_tex_coord; uniform sampler2D u_texture; uniform float u_time; uniform float u_x;\n'+source);
    const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);throw new Error('Water shader link failed');}
    gl.useProgram(program);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const attribute=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(program,'u_texture'),0);this.time=gl.getUniformLocation(program,'u_time');this.offset=gl.getUniformLocation(program,'u_x');this.program=program;
  }
  draw(ctx,time,width=420,height=700,xOffset=0){if(!this.image)return false;
    if(this.program&&!this.destroyed&&!this.gl.isContextLost()){try{const gl=this.gl;if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}gl.viewport(0,0,width,height);gl.useProgram(this.program);gl.uniform1f(this.time,time);gl.uniform1f(this.offset,xOffset);gl.drawArrays(gl.TRIANGLES,0,6);ctx.drawImage(this.canvas,0,0,width,height);return true;}catch{this.program=null;}}
    ctx.drawImage(this.image,0,0,width,height);return true;
  }
  destroy(){this.destroyed=true;const gl=this.gl;if(!gl)return;if(this.texture)gl.deleteTexture(this.texture);if(this.buffer)gl.deleteBuffer(this.buffer);if(this.program)gl.deleteProgram(this.program);gl.getExtension('WEBGL_lose_context')?.loseContext();this.program=null;}
}
