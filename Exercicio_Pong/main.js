const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl2");

if (!gl) {
    throw new Error("WebGL 2 não é suportado.");
}


// VERTICES E CORES


function verticesBarra(){
    return new Float32Array([
        -0.05,  0.2,
        -0.05, -0.2,
         0.05,  0.2,
         0.05,  0.2,
        -0.05, -0.2,
         0.05, -0.2
    ]);
}

function verticesBola(){
    let vertices = [];
    let numSegments = 30;
    let radius = 0.05;

    for (let i = 0; i < numSegments; i++) {
        let theta1 = (i / numSegments) * 2 * Math.PI;
        let theta2 = ((i + 1) / numSegments) * 2 * Math.PI;

        vertices.push(0, 0); // Center of the circle
        vertices.push(radius * Math.cos(theta1), radius * Math.sin(theta1));
        vertices.push(radius * Math.cos(theta2), radius * Math.sin(theta2));
    }

    return new Float32Array(vertices);
}

let verticesBarraDireita = verticesBarra();
let corBarraDireita = new Float32Array([0.0, 0.0, 1.0]);

let verticesBarraEsquerda = verticesBarra();
let corBarraEsquerda = new Float32Array([0.0, 1.0, 0.0]);

let verticesBolaCentro = verticesBola();
let corBolaCentro = new Float32Array([1.0, 0.0, 0.0]);


// TRANSFORMAÇÕES E ESTADO DO JOGO


let MbarraEsquerda = m3.translation(-0.9, 0.0);
let MbarraDireita = m3.translation(0.9, 0.0);
let MbolaCentro = m3.identity();

let tyBE = 0.0;
let tyBD = 0.0;
let txBola = 0.0;
let tyBola = 0.0;
let txBola_offset = 0.015; // Velocidade horizontal da bola
let tyBola_offset = 0.015; // Velocidade vertical da bola

// Placar
let scoreEsquerda = 0;
let scoreDireita = 0;
const scoreEsquerdaEl = document.getElementById('scoreEsquerda');
const scoreDireitaEl = document.getElementById('scoreDireita');

// Controles do teclado
const keys = {};
window.addEventListener("keydown", (e) => { keys[e.key] = true; });
window.addEventListener("keyup", (e) => { keys[e.key] = false; });


// BUFFER, SHADERS E SETUP 


const verticesBuffer = gl.createBuffer();

const vertexShaderSource = `#version 300 es
in vec2 aPosition;
uniform mat3 u_transform;
void main() {
    vec3 position = u_transform * vec3(aPosition, 1.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShaderSource = `#version 300 es
precision mediump float;
uniform vec3 uColor;
out vec4 outColor;
void main() {
    outColor = vec4(uColor, 1.0);
}
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
}

const positionLocation = gl.getAttribLocation(program, "aPosition");
const colorLocation = gl.getUniformLocation(program, "uColor");
const transformLocation = gl.getUniformLocation(program, "u_transform");

gl.clearColor(0.1, 0.1, 0.1, 1.0);

// --------------------------------------------------
// DESENHO (Mantidos iguais ao original)
// --------------------------------------------------

const numComponents = 2;

function drawScene(){
    atualizaAnimacao();
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    
    drawBarraEsquerda();
    drawBarraDireita();
    drawBolaCentro();
    
    requestAnimationFrame(drawScene);
}

function drawBarraEsquerda(){
    gl.bindBuffer(gl.ARRAY_BUFFER, verticesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, verticesBarraEsquerda, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(colorLocation, corBarraEsquerda);
    gl.uniformMatrix3fv(transformLocation, false, MbarraEsquerda);
    gl.drawArrays(gl.TRIANGLES, 0, verticesBarraEsquerda.length / numComponents);
}

function drawBarraDireita(){
    gl.bindBuffer(gl.ARRAY_BUFFER, verticesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, verticesBarraDireita, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(colorLocation, corBarraDireita);
    gl.uniformMatrix3fv(transformLocation, false, MbarraDireita);
    gl.drawArrays(gl.TRIANGLES, 0, verticesBarraDireita.length / numComponents);
}

function drawBolaCentro(){
    gl.bindBuffer(gl.ARRAY_BUFFER, verticesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, verticesBolaCentro, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(colorLocation, corBolaCentro);
    gl.uniformMatrix3fv(transformLocation, false, MbolaCentro);
    gl.drawArrays(gl.TRIANGLES, 0, verticesBolaCentro.length / numComponents);
}

// FÍSICA E REGRAS DO JOGO (CÓDIGO NOVO)


function resetBola() {
    txBola = 0.0;
    tyBola = 0.0;
    // Inverte a direção e mantém a velocidade base
    txBola_offset = txBola_offset > 0 ? -0.015 : 0.015;
    tyBola_offset = (Math.random() > 0.5 ? 1 : -1) * 0.015;
}

function atualizaAnimacao(){
    //  Movimentação das raquetes
    const velocidadeRaquete = 0.02;
    
    // Jogador 1 (Esquerda) - W e S
    if (keys["w"] || keys["W"]) tyBE += velocidadeRaquete;
    if (keys["s"] || keys["S"]) tyBE -= velocidadeRaquete;
    
    // Jogador 2 (Direita) - Setas Cima e Baixo
    if (keys["ArrowUp"]) tyBD += velocidadeRaquete;
    if (keys["ArrowDown"]) tyBD -= velocidadeRaquete;

    // Limitar as raquetes para não saírem da tela (tamanho da barra = 0.4 de altura, limite é +- 0.8)
    tyBE = Math.max(-0.8, Math.min(0.8, tyBE));
    tyBD = Math.max(-0.8, Math.min(0.8, tyBD));

    MbarraEsquerda = m3.translation(-0.9, tyBE);
    MbarraDireita = m3.translation(0.9, tyBD);

    //  Movimentação da bola
    txBola += txBola_offset;
    tyBola += tyBola_offset;

    //  Colisão com Teto e Chão (raio da bola é 0.05)
    if (tyBola > 0.95 || tyBola < -0.95) {
        tyBola_offset = -tyBola_offset;
    }

    // Colisão com as Raquetes
    // Dimensões da Raquete: X varia em +-0.05 do centro. Y varia em +-0.2 do centro.
    // Raquete Esquerda: centro X em -0.9, vai de -0.95 a -0.85
    if (txBola - 0.05 < -0.85 && txBola + 0.05 > -0.95 && 
        tyBola + 0.05 > tyBE - 0.2 && tyBola - 0.05 < tyBE + 0.2) {
        txBola_offset = Math.abs(txBola_offset); // Força a bola a ir para a direita
        txBola = -0.8; // Previne que a bola entre "dentro" da barra
    }
    
    // Raquete Direita: centro X em 0.9, vai de 0.85 a 0.95
    if (txBola + 0.05 > 0.85 && txBola - 0.05 < 0.95 && 
        tyBola + 0.05 > tyBD - 0.2 && tyBola - 0.05 < tyBD + 0.2) {
        txBola_offset = -Math.abs(txBola_offset); // Força a bola a ir para a esquerda
        txBola = 0.8; // Previne que a bola entre "dentro" da barra
    }

    //Pontuação (se passou do limite esquerdo ou direito)
    if (txBola < -1.0) {
        scoreDireita++;
        scoreDireitaEl.innerText = scoreDireita;
        resetBola();
    } else if (txBola > 1.0) {
        scoreEsquerda++;
        scoreEsquerdaEl.innerText = scoreEsquerda;
        resetBola();
    }

    // Aplica a matriz de translação final à bola
    MbolaCentro = m3.translation(txBola, tyBola);
}


drawScene();