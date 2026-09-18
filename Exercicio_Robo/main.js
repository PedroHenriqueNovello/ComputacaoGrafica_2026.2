const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl2");

if (!gl) {
    throw new Error("WebGL 2 não é suportado.");
}

const vertexShaderSource = `#version 300 es
in vec2 aPosition;
uniform mat3 u_viewTransform;
uniform mat3 u_modelTransform;

void main() {
    vec3 position = u_viewTransform * u_modelTransform * vec3(aPosition, 1.0);
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
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(error);
    }
    return shader;
}

function createProgram(gl, vertexShaderSource, fragmentShaderSource) {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
}

const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

// ==================================================
// CLASSE RENDERER
// ==================================================
class Renderer {
    constructor(gl, program) {
        this.gl = gl;
        this.program = program;
        this.positionLocation = gl.getAttribLocation(program, "aPosition");
        this.colorLocation = gl.getUniformLocation(program, "uColor");
        this.viewTransformLocation = gl.getUniformLocation(program, "u_viewTransform");
        this.modelTransformLocation = gl.getUniformLocation(program, "u_modelTransform");
        this.viewTransform = m3.identity();
        this.verticesBuffer = gl.createBuffer();
    }

    defineViewTransform(viewTransform) {
        this.viewTransform = viewTransform;
    }

    draw(object) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.verticesBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, object.vertices, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.positionLocation);
        gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.uniform3fv(this.colorLocation, object.color);
        gl.uniformMatrix3fv(this.modelTransformLocation, false, object.modelTransform);
        gl.uniformMatrix3fv(this.viewTransformLocation, false, this.viewTransform);
        gl.drawArrays(gl.TRIANGLES, 0, object.vertices.length / 2);
    }
}

// ==================================================
// AUXILIARY FUNCTIONS
// ==================================================
function rectangleVertices(x, y, width, height) {
    return [
        x, y,
        x + width, y + height,
        x, y + height,
        x, y,
        x + width, y,
        x + width, y + height
    ];
}

function roadVertices() {
    const vertices = rectangleVertices(-2.0, -0.4, 4.0, 0.8);
    return new Float32Array(vertices);
}

// ==================================================
// CLASSE SCENE OBJECT
// ==================================================
class SceneObject {
    constructor(vertices, color) {
        this.vertices = vertices;
        this.color = color;
        this.modelTransform = m3.identity();
    }

    updateModelTransform(modelTransform) {
        this.modelTransform = modelTransform;
    }
}

// ==================================================
// CLASSE ROAD
// ==================================================
class Road extends SceneObject {
    constructor() {
        super(roadVertices(), new Float32Array([0.2, 0.2, 0.2]));
    }
    draw(renderer) {
        renderer.draw(this);
    }
}

// ==================================================
// CLASSES DAS PARTES DO ROBÔ
// ==================================================
class RobotBody extends SceneObject {
    constructor(color) {
        super(new Float32Array(rectangleVertices(-0.15, -0.2, 0.3, 0.4)), color);
    }
}

class RobotHead extends SceneObject {
    constructor(color) {
        super(new Float32Array(rectangleVertices(-0.1, 0.0, 0.2, 0.2)), color);
    }
}

class RobotLimb extends SceneObject {
    constructor(color, isArm) {
        const width = 0.08;
        const height = isArm ? 0.25 : 0.3;
        super(new Float32Array(rectangleVertices(-width / 2, -height, width, height)), color);
    }
}

// ==================================================
// CLASSE ROBÔ
// ==================================================
class Robot {
    constructor(tx, ty, color, speed) {
        this.tx = tx;
        this.ty = ty;
        this.speed = speed;
        this.swingTime = 0.0; // Usado para o balanço dos membros

        this.body = new RobotBody(color);
        this.head = new RobotHead(color);
        
        // Cor um pouco mais escura para os membros para dar contraste
        const limbColor = new Float32Array([color[0] * 0.8, color[1] * 0.8, color[2] * 0.8]);
        this.leftArm = new RobotLimb(limbColor, true);
        this.rightArm = new RobotLimb(limbColor, true);
        this.leftLeg = new RobotLimb(limbColor, false);
        this.rightLeg = new RobotLimb(limbColor, false);
    }

    move() {
        this.tx += this.speed;
        this.swingTime += 0.05;

        // Limites da tela para ir e voltar
        if (this.tx > 1.8 || this.tx < -1.8) {
            this.speed = -this.speed;
        }

        const robotTransform = m3.translation(this.tx, this.ty);

        // Corpo
        this.body.updateModelTransform(robotTransform);

        // Cabeça
        const headLocalTransform = m3.translation(0.0, 0.2);
        this.head.updateModelTransform(m3.multiply(robotTransform, headLocalTransform));

        // Ângulos pendulares
        const armAngle = Math.sin(this.swingTime) * 0.6; 
        const legAngle = Math.sin(this.swingTime) * 0.4; 

        // Braço Esquerdo
        const leftArmLocal = m3.multiply(
            m3.translation(-0.18, 0.15),
            m3.rotation(armAngle)
        );
        this.leftArm.updateModelTransform(m3.multiply(robotTransform, leftArmLocal));

        // Braço Direito
        const rightArmLocal = m3.multiply(
            m3.translation(0.18, 0.15),
            m3.rotation(-armAngle)
        );
        this.rightArm.updateModelTransform(m3.multiply(robotTransform, rightArmLocal));

        // Perna Esquerda
        const leftLegLocal = m3.multiply(
            m3.translation(-0.1, -0.2),
            m3.rotation(-legAngle) 
        );
        this.leftLeg.updateModelTransform(m3.multiply(robotTransform, leftLegLocal));

        // Perna Direita
        const rightLegLocal = m3.multiply(
            m3.translation(0.1, -0.2),
            m3.rotation(legAngle)
        );
        this.rightLeg.updateModelTransform(m3.multiply(robotTransform, rightLegLocal));
    }

    draw(renderer) {
        renderer.draw(this.leftArm);
        renderer.draw(this.rightArm);
        renderer.draw(this.leftLeg);
        renderer.draw(this.rightLeg);
        renderer.draw(this.body);
        renderer.draw(this.head);
    }
}

// ==================================================
// CLASSE SCENE
// ==================================================
class Scene {
    constructor(gl, program) {
        this.renderer = new Renderer(gl, program);
        this.viewTransform = m3.setClippingWindow(-2.0, -1.0, 2.0, 1.0);
        this.renderer.defineViewTransform(this.viewTransform);

        this.road = new Road();

        // Inicializamos APENAS UM robô vermelho no centro da tela
        this.robot = new Robot(0.0, 0.0, new Float32Array([1.0, 0.0, 0.0]), 0.005);
    }

    update() {
        // Atualiza apenas o único robô
        this.robot.move();
    }

    draw() {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);

        this.road.draw(this.renderer);

        // Desenha apenas o único robô
        this.robot.draw(this.renderer);
    }

    execute() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.execute());
    }

    init() {
        requestAnimationFrame(() => this.execute());
    }
}

// ==================================================
// CONFIGURAÇÃO INICIAL DO WEBGL
// ==================================================
gl.clearColor(0.1, 0.1, 0.1, 1.0);
gl.viewport(0, 0, canvas.width, canvas.height);

// ==================================================
// CRIAR CENA E INICIAR ANIMAÇÃO
// ==================================================
const scene = new Scene(gl, program);
scene.init();