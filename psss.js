//------------------------------------------------------------------------------
var gWidth = 1024;
var gHeight = 768;

//var gIntervalID;
var gRequestID;

var gWorld;
var gParSys;
var gCanvas;
var gTransMap;
var gTransMapStyle;
var gTransMapFilter;    // bool
var gTransMapMode;      // bool

var gPreset;

//------------------------------------------------------------------------------
const DEG = 180 / Math.PI;
const POINT3D_ZERO = [0, 0, 0];
const ANGLE3D_ZERO = [0, 0, 0];
const DEG2HZ = 180 / Math.PI / 360;
const MAX_WAVE_CNT = 3;
const AXIS_CNT = 3;
const AXIS_NAME = ["X", "Y", "Z"]
const MAX_SIN_MAGIC = 4;

const ParticleRenderMode = {
    rmDraw: 0,
    rmDrawMixMode: 1,
    rmDrawStars: 2
}

const TransMapStyle = {
    tmsWaved: 0,
    tmsWavedZoom: 1,
    tmsWavedZoomOverlay: 2,
    tmsWavedZoomCombined: 3
}

const TransMapMode = {
    tmmApplyBefore: 0,
    tmmApplyAfter: 1
}

//------------------------------------------------------------------------------
class PixelCanvas {
    #visCvs;
    visCtx;
    #bufCvs;
    #bufCtx;
    #buf2Cvs;
    #buf2Ctx;

    ImgData;

    brightness;
    blurradius;

    constructor(aCanvasElement, aWidth, aHeight) {
        this.#visCvs = aCanvasElement;
        this.visCtx = this.#visCvs.getContext('2d');

        this.#bufCvs = document.createElement('canvas');
        this.#bufCvs.width = aWidth;
        this.#bufCvs.height = aHeight;
        this.#bufCtx = this.#bufCvs.getContext('2d');

        this.#buf2Cvs = document.createElement('canvas');
        this.#buf2Cvs.width = aWidth;
        this.#buf2Cvs.height = aHeight;
        this.#buf2Ctx = this.#buf2Cvs.getContext('2d');

        this.brightness = 0.9999;
        this.blurradius = 4;

        this.width = aWidth;//$(this.#VisCvs).width();
        this.height = aHeight//$(this.#VisCvs).height();

        // ??? necessary
        this.visCtx.fillRect(0, 0, this.#visCvs.width, this.#visCvs.height);
    }

    vis2Data() {
        this.vis2Off();
        this.off2Data();
    }

    off2Data() {
        this.ImgData = this.#bufCtx.getImageData(0, 0, this.width, this.height);
    }

    data2Vis() {
        this.#buf2Ctx.putImageData(this.ImgData, 0, 0);
        this.visCtx.drawImage(this.#buf2Cvs, 0, 0, this.#visCvs.width, this.#visCvs.height);
    }

    vis2Off() {
        this.#bufCtx.filter = 'brightness(' + this.brightness + ') blur(' + this.blurradius + 'px)';
        this.#bufCtx.drawImage(this.#visCvs, 0, 0, this.width, this.height);
    }

    setPixel(x, y, c) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            var offset = 4 * (y * this.width + x);

            this.ImgData.data[offset] = c[0];
            this.ImgData.data[offset + 1] = c[1];
            this.ImgData.data[offset + 2] = c[2];
            this.ImgData.data[offset + 3] = c[3];
        }
    }

    getPixel(x, y) {
        var result = new Array(4);

        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            var offset = 4 * (y * this.width + x);

            result[0] = this.ImgData.data[offset];
            result[1] = this.ImgData.data[offset + 1];
            result[2] = this.ImgData.data[offset + 2];
            result[3] = this.ImgData.data[offset + 3];
        }

        return result;
    }

    mixPixel(x, y, c, aIntensity) {
        var cDst = this.getPixel(x, y);

        cDst[0] = cDst[0] + c[0] >> aIntensity;
        cDst[1] = cDst[1] + c[1] >> aIntensity;
        cDst[2] = cDst[2] + c[2] >> aIntensity;
        cDst[3] = cDst[3] + c[3] >> aIntensity;

        if (cDst[0] > 255) { cDst[0] = 255; }
        if (cDst[1] > 255) { cDst[1] = 255; }
        if (cDst[2] > 255) { cDst[2] = 255; }
        if (cDst[3] > 255) { cDst[3] = 255; }

        this.setPixel(x, y, cDst);
    }

    drawStar(x, y, c) {
        if (x > 0 && x < this.width - 1 && y > 0 && y < this.height - 1) {
            this.mixPixel(x, y, c, 1);
            this.mixPixel(x + 1, y, c, 2);
            this.mixPixel(x - 1, y, c, 2);
            this.mixPixel(x, y + 1, c, 2);
            this.mixPixel(x, y - 1, c, 2);
        }
    }

    copyImageData() {
        var result = this.#bufCtx.createImageData(this.width, this.height);

        result.data.set(this.ImgData.data);

        return result;
    }
}

//------------------------------------------------------------------------------
class TranslationMap {
    width;
    height;
    #transmap;

    constructor(aWidth, aHeight) {
        this.width = aWidth;
        this.height = aHeight;
        this.#transmap = new Array(this.width * this.height).fill(0);
    }

    rollToRange(aValue, aMin, aMax) {
        var result = aValue;

        if (aValue < aMin) {
            result = aMin + (aMin - aValue) % (aMax - aMin);
        } else if (aValue > aMax) {
            result = aMax - (aValue - aMax) % (aMax - aMin);
        }

        return result;
    }

    restrictToRange(aValue, aMin, aMax) {
        var result = aValue;

        if (aValue < aMin) {
            result = aMin;
        } else if (aValue > aMax) {
            result = aMax;
        }

        return result;
    }

    zoomCoordinate(aReference, aCoordinate, aZoomFactor) {
        return Math.round(aReference + (aCoordinate - aReference) * aZoomFactor);
    }

    setTranslation(aSrcX, aSrcY, aDstX, aDstY) {
        aDstX = this.rollToRange(aDstX, 0, this.width - 1);
        aDstY = this.rollToRange(aDstY, 0, this.height - 1);

        this.#transmap[aSrcY * this.width + aSrcX] = (aDstY * this.width + aDstX);
    }

    applyTransMap(aSrcBuf, aDstBuf) {
        for (var n = 0; n < this.width * this.height; n++) {
            var srcAdr = this.#transmap[n] * 4;
            var dstAdr = n * 4;

            aDstBuf[dstAdr] = aSrcBuf[srcAdr];
            aDstBuf[dstAdr + 1] = aSrcBuf[srcAdr + 1];
            aDstBuf[dstAdr + 2] = aSrcBuf[srcAdr + 2];
            aDstBuf[dstAdr + 3] = aSrcBuf[srcAdr + 3];
        }
    }

    zoom(aCenterX, aCenterY, aZoomX, aZoomY) {
        for (var x = 0; x < this.width; x++) {
            for (var y = 0; y < this.height; y++) {
                var dX = this.zoomCoordinate(aCenterX, x, aZoomX);
                var dY = this.zoomCoordinate(aCenterY, y, aZoomY);

                this.setTranslation(x, y, dX, dY);
            }
        }
    }

    prepareWaveTrans(aXBuf, aYBuf, aParams) {
        for (var x = 0; x < this.width; x++) {
            var x1 = 0;

            for (var n = 0; n < MAX_SIN_MAGIC; n++) {
                aXBuf[x] += Math.sin(((360 * x * aParams[1][n]) / this.width) / DEG) * aParams[0][n];
            }
        }

        for (var y = 0; y < this.height; y++) {
            var y1 = 0;

            for (var n = 0; n < MAX_SIN_MAGIC; n++) {
                aYBuf[y] += Math.sin(((360 * y * aParams[3][n]) / this.height) / DEG) * aParams[2][n];
            }
        }
    }

    prepareWaveZoom(aXBuf, aYBuf, aParams) {
        for (var x = 0; x < this.width; x++) {
            for (var n = 0; n < MAX_SIN_MAGIC; n++) {
                aXBuf[x] += aParams[0][n] + Math.sin(((360 * x * aParams[1][n]) / this.width) / DEG) * aParams[0][n];
            }
        }

        for (var y = 0; y < this.height; y++) {
            for (var n = 0; n < MAX_SIN_MAGIC; n++) {
                aYBuf[y] += +aParams[2][n] + Math.sin(((360 * y * aParams[3][n]) / this.height) / DEG) * aParams[2][n];
            }
        }
    }

    sinMagic(aParams) {
        var wX = Array(this.width).fill(0);
        var wY = Array(this.height).fill(0);

        this.prepareWaveTrans(wX, wY, aParams);

        for (var x = 0; x < this.width; x++) {
            for (var y = 0; y < this.height; y++) {
                var x2 = Math.round(this.restrictToRange(x + wY[y], -100000, 100000));
                var y2 = Math.round(this.restrictToRange(y + wX[x], -100000, 100000));

                this.setTranslation(x, y, x2, y2);
            }
        }
    }

    sinMagicZoom(aParams, aCenterX, aCenterY, doOverlayXY) {
        var wX = Array(this.width).fill(0);
        var wY = Array(this.height).fill(0);

        this.prepareWaveTrans(wX, wY, aParams);

        for (var x = 0; x < this.width; x++) {
            for (var y = 0; y < this.height; y++) {
                var x2 = 0;
                var y2 = 0;

                if (doOverlayXY) {
                    x2 = this.zoomCoordinate(aCenterX, x, 1 - (wX[x] + wY[y]) / 2);
                    y2 = this.zoomCoordinate(aCenterY, y, 1 - (wX[x] + wY[y]) / 2);
                } else {
                    x2 = this.zoomCoordinate(aCenterX, x, 1 - wX[x]);
                    y2 = this.zoomCoordinate(aCenterY, y, 1 - wY[y]);
                }

                this.setTranslation(x, y, x2, y2);
            }
        }
    }

    sinMagicZoom2(aParams1, aParams2, aCenterX, aCenterY) {
        var wX = Array(this.width).fill(0);
        var wY = Array(this.height).fill(0);
        var w2X = Array(this.width).fill(0);
        var w2Y = Array(this.height).fill(0);

        this.prepareWaveTrans(wX, wY, aParams1);
        this.prepareWaveZoom(w2X, w2Y, aParams2);

        for (var x = 0; x < this.width; x++) {
            for (var y = 0; y < this.height; y++) {
                var x2 = this.zoomCoordinate(aCenterX, Math.round(x + wY[y]), 1 - (w2X[x] + w2Y[y]) / 2);
                var y2 = this.zoomCoordinate(aCenterY, Math.round(y + wX[x]), 1 - (w2X[x] + w2Y[y]) / 2);

                this.setTranslation(x, y, x2, y2);
            }
        }
    }
}

//------------------------------------------------------------------------------
class Util3d {

    static translatePoints(aSrcPointArray, aDstPointArray, aVector) {
        for (var n = 0; n < aSrcPointArray.length; n++) {
            var p = aSrcPointArray[n];

            aDstPointArray[n] = [p[0] + aVector[0], p[1] + aVector[1], p[2] + aVector[2]];
        }
    }

    static rotatePoints(aSrcPointArray, aDstPointArray, aAngle3d) {
        var sinWx = Math.sin(aAngle3d[0] / DEG);
        var cosWx = Math.cos(aAngle3d[0] / DEG);

        var sinWy = Math.sin(aAngle3d[1] / DEG);
        var cosWy = Math.cos(aAngle3d[1] / DEG);

        var sinWz = Math.sin(aAngle3d[2] / DEG);
        var cosWz = Math.cos(aAngle3d[2] / DEG);

        for (var n = 0; n < aSrcPointArray.length; n++) {
            var k;

            var p = aSrcPointArray[n];

            var x = p[0];
            var y = p[1];
            var z = p[2];

            // rot x
            k = y * cosWx - z * sinWx;
            z = y * sinWx + z * cosWx;
            y = k;

            // rot y
            k = x * cosWy + z * sinWy;
            z = -x * sinWy + z * cosWy;
            x = k;

            // rot z
            k = x * cosWz - y * sinWz;
            y = x * sinWz + y * cosWz;
            x = k;

            aDstPointArray[n] = [x, y, z];
        }
    }

    static projectPoints(aScrPointArray, aDstPointArray2d, aPerspectiveZ, aOrigin) {
        for (var n = 0; n < aScrPointArray.length; n++) {
            var p = aScrPointArray[n];

            var q = p[2] - aPerspectiveZ;

            if (q > 0) {
                q = aPerspectiveZ / q;
                aDstPointArray2d[n] = [Math.round(aOrigin[0] - p[0] * q), Math.round(aOrigin[1] - p[1] * q)]
            } else {
                aDstPointArray2d[n] = [Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER];
            }
        }
    }

    static angle3d(aX, aY, aZ) {
        return [aX, aY, aZ];
    }

    static addAngle3d(a1, a2) {
        var result;

        result = [a1[0] + a2[0],
        a1[1] + a2[1],
        a1[2] + a2[2]];

        return result;
    }

    static subAngle3d(a1, a2) {
        var result;

        result = [a1[0] - a2[0],
        a1[1] - a2[1],
        a1[2] - a2[2]];

        return result;
    }

    static mulAngle3d(a1, aFactor) {
        var result;

        result = [a1[0] * aFactor,
        a1[1] * aFactor,
        a1[2] * aFactor];

        return result;
    }

    static divAngle3d(aAngle, aDivider) {
        var result;

        result = [aAngle[0] / aDivider,
        aAngle[1] / aDivider,
        aAngle[2] / aDivider];

        return result;
    }

    static normalizeAngle(aAngle) {
        var result;

        if (aAngle >= 0) {
            result = aAngle - (Math.round(aAngle / 360) * 360);
        } else {
            result = 360 - (Math.abs(aAngle) - (Math.round(Math.acos(aAngle) / 360) * 360));
        }

        return result;
    }

    static normalizeAngle3d(aAngle) {
        var result;

        result = [this.normalizeAngle(aAngle[0]),
        this.normalizeAngle(aAngle[1]),
        this.normalizeAngle(aAngle[2])];

        return result;
    }


    static point3d(x, y, z) {
        return [x, y, z];
    }

    static addPoint3d(p1, p2) {
        var result;

        result = [p1[0] + p2[0],
        p1[1] + p2[1],
        p1[2] + p2[2]];

        return result;
    }

    static subPoint3d(p1, p2) {
        var result;

        result = [p1[0] - p2[0],
        p1[1] - p2[1],
        p1[2] - p2[2]];

        return result;
    }

    static mulPoint3d(aPoint, aFactor) {
        var result;

        result = [aPoint[0] / aFactor,
        aPoint[1] / aFactor,
        aPoint[2] / aFactor];

        return result;
    }

    static divPoint3d(aPoint, aDivider) {
        var result;

        result = [aPoint[0] / aDivider,
        aPoint[1] / aDivider,
        aPoint[2] / aDivider];

        return result;
    }

    static rotatePoint(aPoint, aAngle3d) {
        var result;

        var k;
        var x, y, z;
        var cosWx;
        var cosWy;
        var cosWz;
        var sinWx;
        var sinWy;
        var sinWz;

        x = aPoint[0];
        y = aPoint[1];
        z = aPoint[2];

        // rot x
        sinWx = Math.sin(aAngle3d[0]);
        cosWx = Math.cos(aAngle3d[0]);

        k = y * cosWx - z * sinWx;
        z = y * sinWx + z * cosWx;
        y = k;

        // rot y
        sinWy = Math.sin(aAngle3d[1]);
        cosWy = Math.cos(aAngle3d[1]);

        k = x * cosWy + z * sinWy;
        z = -x * sinWy + z * cosWy;
        x = k;

        // rot z
        sinWz = Math.sin(aAngle3d[2]);
        cosWz = Math.cos(aAngle3d[2]);

        k = x * cosWz - y * sinWz;
        y = x * sinWz + y * cosWz;
        x = k;

        result = [x, y, z];

        return result;
    }

}

//------------------------------------------------------------------------------
class World3d {
    origin;
    viewPos;
    viewAngle;
    perspectiveZ;
    #objects;

    canvas;

    constructor(aOrigin, aViewPos, aViewAngle, aPerspectiveZ, aCanvas) {
        this.origin = aOrigin;
        this.viewPos = aViewPos;
        this.viewAngle = aViewAngle;
        this.perspectiveZ = aPerspectiveZ;
        this.canvas = aCanvas;

        this.#objects = new Array();
    }

    count() {
        return this.#objects.length;
    }

    addObject(aObject) {
        this.#objects.push(aObject);
        aObject.world = this;
    }

    doWorld() {
        for (var n = 0; n < this.count(); n++) {
            this.#objects[n].doObject();
            this.#objects[n].transform();
            this.#objects[n].project();
            this.#objects[n].render();
        }
    }
}

//------------------------------------------------------------------------------
class Object3d {
    world;

    position = [0, 0, 0];
    angle = [0, 0, 0];

    constructor(aWorld) {
        this.world = aWorld;
    }

    doObject() { }
    transform() { }
    project() { }
    render() { }

}

//------------------------------------------------------------------------------
class ParticleSystem extends Object3d {
    _particles;
    #particlesTrans;
    #particles2d;
    _colors;

    renderMode;

    #startTime;
    #lastDoObject;

    speed3d;
    rotationSpeed3d;

    constructor(aWorld, aParticleCount) {
        super(aWorld);

        this.allocateSystem(aParticleCount);

        this.renderMode = ParticleRenderMode.rmDraw;

        this.speed3d = POINT3D_ZERO;
        this.rotationSpeed3d = ANGLE3D_ZERO;

        this.#startTime = -1;
        this.#lastDoObject = -1;
    }

    allocateSystem(aParticleCount) {
        this._particles = new Array(aParticleCount);
        for (var n = 0; n < this._particles.length; n++) {
            this._particles[n] = [0.0, 0.0, 0.0];
        }

        this.#particlesTrans = new Array(aParticleCount);
        for (var n = 0; n < this.#particlesTrans.length; n++) {
            this.#particlesTrans[n] = [0.0, 0.0, 0.0];
        }

        this.#particles2d = new Array(aParticleCount);
        for (var n = 0; n < this.#particles2d.length; n++) {
            this.#particles2d[n] = [0, 0];
        }

        this._colors = new Array(aParticleCount);
        for (var n = 0; n < this._colors.length; n++) {
            this._colors[n] = [0, 0, 0, 0];
        }
    }

    clearSystem() {
        for (var n = 0; n < this._particles.length; n++) {
            this._particles[n] = [0.0, 0.0, 0.0];
        }
    }

    getElapsed() {
        var now = new Date();
        return now.getTime() - this.#startTime;
    }

    doObject() {
        if (this.#startTime < 0) {
            var now = new Date();
            this.#startTime = now.getTime();
            this.#lastDoObject = this.#startTime;
        }

        var time;
        var delta;

        time = this.getElapsed();

        if (this.#lastDoObject < time) {
            delta = time - this.#lastDoObject;

            this.angle = Util3d.addAngle3d(this.angle, Util3d.divAngle3d(this.rotationSpeed3d, 1000 / delta));
            this.position = Util3d.addPoint3d(this.position, Util3d.divPoint3d(this.speed3d, 1000 / delta));
        }

        this.#lastDoObject = time;
    }

    draw() {
        var w = this.world.canvas.width;
        var h = this.world.canvas.height;

        for (var n = 0; n < this.#particles2d.length; n++) {
            this.world.canvas.setPixel(this.#particles2d[n][0], this.#particles2d[n][1], this._colors[n]);
        }
    }

    drawMixMode() {
        var w = this.world.canvas.width;
        var h = this.world.canvas.height;

        for (var n = 0; n < this.#particles2d.length; n++) {
            this.world.canvas.mixPixel(this.#particles2d[n][0], this.#particles2d[n][1], this._colors[n], 1);
        }
    }

    drawStars() {
        var w = this.world.canvas.width;
        var h = this.world.canvas.height;

        for (var n = 0; n < this.#particles2d.length; n++) {
            this.world.canvas.drawStar(this.#particles2d[n][0], this.#particles2d[n][1], this._colors[n]);
        }
    }

    //lightZ() {}

    makeTestCube(aSide, aColor) {
        var n;
        var p;

        p = Math.round(Math.pow(this._particles.length, 1 / 3) + 0.5) - 1;

        n = 0;

        for (var x = 0; x <= p; x++) {
            for (var y = 0; y <= p; y++) {
                for (var z = 0; z <= p; z++) {
                    if (n <= this._particles.length) {
                        this._particles[n] = [Math.round(x * aSide / p - aSide / 2),
                        Math.round(y * aSide / p - aSide / 2),
                        Math.round(z * aSide / p - aSide / 2)];

                        if (Array.isArray(aColor)) {
                            this._colors[n] = aColor;
                        } else {
                            this._colors[n] = [Math.round(Math.sin(x * 5 / DEG) * 255), Math.round(Math.sin(y * 5.1 / DEG) * 255), Math.round(Math.sin(z * 5.2 / DEG) * 255), 255];
                        }
                    }
                    n++;
                }
            }
        }
    }

    transform() {
        Util3d.rotatePoints(this._particles, this.#particlesTrans, Util3d.subAngle3d(this.angle, this.world.viewAngle));
        var tmpPos = Util3d.rotatePoint(Util3d.subPoint3d(this.position, this.world.viewPos), Util3d.subAngle3d(ANGLE3D_ZERO, this.world.viewAngle));
        Util3d.translatePoints(this.#particlesTrans, this.#particlesTrans, tmpPos);
    }

    project() {
        Util3d.projectPoints(this.#particlesTrans, this.#particles2d, this.world.perspectiveZ, this.world.origin);
    }

    render() {
        switch (this.renderMode) {
            case ParticleRenderMode.rmDraw:
                this.draw();
                break;

            case ParticleRenderMode.rmDrawMixMode:
                this.drawMixMode();
                break;

            case ParticleRenderMode.rmDrawStars:
                this.drawStars();
                break;
        }
    }

    applyPreset(aPreset) {
        this.rotationSpeed3d = aPreset.Rotation;
        this.waveSpeed = aPreset.WaveSpeed;

        for (var n = 0; n < MAX_WAVE_CNT; n++) {
            for (var i = 0; i < AXIS_CNT; i++) {
                this.waves[n][i].phase = aPreset.Waves[n][i].Phase;
                this.waves[n][i].am.base = aPreset.Waves[n][i].Am.Base;
                this.waves[n][i].am.amp = aPreset.Waves[n][i].Am.Amp;
                this.waves[n][i].am.freq = aPreset.Waves[n][i].Am.Freq;
                this.waves[n][i].fm.base = aPreset.Waves[n][i].Fm.Base;
                this.waves[n][i].fm.amp = aPreset.Waves[n][i].Fm.Amp;
                this.waves[n][i].fm.freq = aPreset.Waves[n][i].Fm.Freq;
            }
        }

        this.scaleWaves(aPreset.Width, aPreset.Height);

        this.colorBase = aPreset.ColorBase;
        this.colorAmp = aPreset.ColorAmp;
        this.colorFreq = aPreset.ColorFreq;
        this.colorShift = aPreset.ColorShift;

        this.renderMode = aPreset.RenderMode;
    }
}

class WaveParam {
    base;
    amp;
    freq;

    constructor() {
        this.base = 0;
        this.amp = 0;
        this.freq = 0;
    }
}

class Wave {
    phase;
    am; // WaveParam
    fm; // WaveParam

    constructor() {
        this.phase = 0;
        this.am = new WaveParam();
        this.fm = new WaveParam();
    }

    static waveArray() {
        return [[new Wave(), new Wave(), new Wave()],
        [new Wave(), new Wave(), new Wave()],
        [new Wave(), new Wave(), new Wave()]];
    }
}

class SinMagicParams {
    xAmp;
    xFreq;
    yAmp;
    yFreq;

    constructor() {
        xAmp = [0, 0, 0, 0];
        xFreq = [0, 0, 0, 0];
        yAmp = [0, 0, 0, 0];
        yFreq = [0, 0, 0, 0];
    }
}

class WaveConfig {
    name;
    particleCount;
    motionBlur;
    smoothFilter;
    transMapFilter;
    renderMode;

    transMapMode;
    transMapStyle;
    zoomCenterX;
    zoomCenterY;

    waveSpeed;
    pos;

    colorBase;
    colorAmp;
    colorFreq;
    colorShift;

    waveX;
    waveY;
    waveZ;

    startAngle;
    rotAngle;

    transSinMagic;

    width;
    height;

    constructor() {
        waveX = [new Wave(), new Wave(), new Wave()];
        waveY = [new Wave(), new Wave(), new Wave()];
        waveZ = [new Wave(), new Wave(), new Wave()];

        transSinMagic = [new SinMagicParams(), new SinMagicParams()];
    }
}

class ParticleWaves extends ParticleSystem {
    waves;
    pos;
    waveSpeed;

    colorBase;
    colorAmp;
    colorFreq;
    colorShift;

    constructor(aWorld, aParticleCount) {
        super(aWorld, aParticleCount);

        this.waves = [[new Wave(), new Wave(), new Wave()],
        [new Wave(), new Wave(), new Wave()],
        [new Wave(), new Wave(), new Wave()]];

        this.pos = 0;
    }

    scaleWavesByFactor(aScalefactor) {
        for (var n = 0; n < MAX_WAVE_CNT; n++) {
            for (var i = 0; i < AXIS_CNT; i++) {
                this.waves[n][i].am.base *= aScalefactor;
                this.waves[n][i].am.amp *= aScalefactor;
            }
        }
    }

    scaleWaves(aSrcWidth, aScrHeight) {
        var w = this.world.canvas.width;
        var h = this.world.canvas.height;

        var zScr = (aSrcWidth + aScrHeight) / 2;
        var zDst = (w + h) / 2;

        for (var n = 0; n < MAX_WAVE_CNT; n++) {
            this.waves[n][0].am.base = (this.waves[n][0].am.base * w) / aSrcWidth;
            this.waves[n][0].am.amp = (this.waves[n][0].am.amp * w) / aSrcWidth;

            this.waves[n][1].am.base = (this.waves[n][1].am.base * h) / aScrHeight;
            this.waves[n][1].am.amp = (this.waves[n][1].am.amp * h) / aScrHeight;

            this.waves[n][2].am.base = (this.waves[n][2].am.base * zDst) / zScr;
            this.waves[n][2].am.amp = (this.waves[n][2].am.amp * zDst) / zScr;
        }
    }

    calcWaveParam(aWaveParam, aTime) {
        return aWaveParam.base + Math.sin(aTime * aWaveParam.freq / DEG) * aWaveParam.amp;
    }

    calcWave(aParticleArray, aWaveIndex, aAxis, aStep, aAM, aFM, aPH) {
        if (aAM[aWaveIndex][aAxis] != 0) { }
        var n = 0;

        for (var t = 0; t <= aParticleArray.length - 1; t++) {
            var p = aParticleArray[t];

            var v = Math.sin((n + aPH[aWaveIndex][aAxis]) * aFM[aWaveIndex][aAxis]) * aAM[aWaveIndex][aAxis];

            p[aAxis] += v;

            aParticleArray[t] = p;

            n += aStep;
        }
    }

    calcColorComponent(aColorArray, aBitShift, aBase, aAmplitude, aFrequency, aShift, aPosition, aStep) {
        var n = 0;

        for (var t = 0; t <= aColorArray.length - 1; t++) {
            var c = Math.round(aBase + Math.sin(n * aFrequency / DEG + aPosition * aShift) * aAmplitude);

            if (c < 0) { c = 0 };
            if (c > 255) { c = 255 };

            aColorArray[t] = aColorArray[t] | (c << aBitShift);

            n += aStep;
        }
    }

    doObject() {
        var am = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        var fm = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        var ph = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

        var scaledTime = this.pos;

        for (var t = 0; t < MAX_WAVE_CNT; t++) {
            for (var q = 0; q < AXIS_CNT; q++) {
                am[t][q] = this.calcWaveParam(this.waves[t][q].am, scaledTime);
                fm[t][q] = this.calcWaveParam(this.waves[t][q].fm, scaledTime) / DEG;
                ph[t][q] = this.waves[t][q].phase;
            }
        }

        var cStep = 360 / this._particles.length;

        // waves
        this.clearSystem();  // is necessary because we only calc waves if we know that a result<>0 will come out

        for (var t = 0; t < MAX_WAVE_CNT; t++) {
            for (var q = 0; q < AXIS_CNT; q++) {
                this.calcWave(this._particles, t, q, cStep, am, fm, ph);
            }
        }

        // colors
        var n = 0;
        for (var t = 0; t <= this._particles.length - 1; t++) {
            var c = [0, 0, 0, 255];

            for (var i = 0; i <= 2; i++) {
                c[i] = Math.round(this.colorBase[i] + Math.sin(n * this.colorFreq[i] / DEG + this.pos * this.colorShift[i]) * this.colorAmp[i]);

                if (c[i] < 0) { c[i] = 0; }
                if (c[i] > 255) { c[i] = 255; }
            }

            this._colors[t] = c;

            n += cStep;
        }

        this.pos += this.waveSpeed;

        super.doObject();
    }

}

//------------------------------------------------------------------------------
function testCube() {
    var cv = new PixelCanvas($("#world").get(0), 1024, 768);

    var world = new World3d([cv.width / 2, cv.height / 2], POINT3D_ZERO, ANGLE3D_ZERO, -(cv.width + cv.height) / 2, cv);
    var pSys = new ParticleSystem(world, 10000);
    pSys.rotationSpeed3d = [5, 5, 5];

    pSys.renderMode = ParticleRenderMode.rmDrawStars
    world.addObject(pSys);

    pSys.makeTestCube(200, null);

    intervalID = setInterval(function () {
        cv.vis2Data();
        world.doWorld();
        cv.data2Vis();
    }, 10)
}

function selectPreset(aName) {
    gPreset = JSON.parse(JSON.stringify(g_psss_presets[aName]));  // deep copy preset

    applyPreset();
}

function applyPreset() {
    gCanvas = new PixelCanvas($("#world").get(0), gWidth, gHeight);
    gTransMap = new TranslationMap(gWidth, gHeight);

    gWorld = new World3d([gCanvas.width / 2, gCanvas.height / 2], POINT3D_ZERO, ANGLE3D_ZERO, -(gCanvas.width + gCanvas.height) / 2, gCanvas);

    gParSys = new ParticleWaves(gWorld, gPreset.ParticleCount * 5);

    gCanvas.brightness = gPreset.MotionBlur / 8.1;
    gCanvas.blurradius = gPreset.SmoothFilter ? 1 : 0;

    gParSys.applyPreset(gPreset);

    gTransMapStyle = gPreset.TransMapStyle;
    gTransMapFilter = gPreset.TransMapFilter;
    gTransMapMode = gPreset.TransMapMode;

    calcTransMap();

    gWorld.addObject(gParSys);
    
    if(gRequestID) {
        window.cancelAnimationFrame(gRequestID);
        gRequestID=undefined;
    }
    gRequestID=window.requestAnimationFrame(drawFrame);
}

function drawFrame() {
    gCanvas.vis2Data();

    if (gTransMapMode == TransMapMode.tmmApplyAfter) {
        gWorld.doWorld();
    }

    if (gTransMapFilter) {
        var idSrc = gCanvas.copyImageData();
        gTransMap.applyTransMap(idSrc.data, gCanvas.ImgData.data);
    }

    if (gTransMapMode == TransMapMode.tmmApplyBefore) {
        gWorld.doWorld();
    }

    gCanvas.data2Vis();
    
    gRequestID=window.requestAnimationFrame(drawFrame);
}

function calcTransMap() {
    switch (gTransMapStyle) {
        case TransMapStyle.tmsWaved: {
            var sinMagic = JSON.parse(JSON.stringify(gPreset.SinMagicParams));  // deep copy preset

            for (n = 0; n < MAX_SIN_MAGIC; n++) {
                sinMagic[0][n] = (sinMagic[0][n] * gWidth) / 100;
                sinMagic[2][n] = (sinMagic[2][n] * gHeight) / 100;
            }

            gTransMap.sinMagic(sinMagic);
            break;
        }

        case TransMapStyle.tmsWavedZoom:
            gTransMap.sinMagicZoom(gPreset.SinMagicParams, (gPreset.ZoomCenterX * gWidth) / 100, (gPreset.ZoomCenterY * gHeight) / 100, false);
            break;

        case TransMapStyle.tmsWavedZoomOverlay:
            gTransMap.sinMagicZoom(gPreset.SinMagicParams, (gPreset.ZoomCenterX * gWidth) / 100, (gPreset.ZoomCenterY * gHeight) / 100, true);
            break;

        case TransMapStyle.tmsWavedZoomCombined:
            gTransMap.sinMagicZoom2(gPreset.SinMagicParams, gPreset.SinMagicParams2, (gPreset.ZoomCenterX * gWidth) / 100, (gPreset.ZoomCenterY * gHeight) / 100);
            break;
    }
}

function get1stFromName(aInputName) {
    var idx1 = aInputName.indexOf("_");
    var idx2 = aInputName.indexOf("_", idx1 + 1);

    var result;

    if (idx2 >= 0) {
        result = parseInt(aInputName.substr(idx1 + 1, idx2 - idx1 - 1));
    } else {
        result = parseInt(aInputName.substr(idx1 + 1,));
    }

    return result;
}

function get2ndFromName(aInputName) {
    var idx1 = aInputName.indexOf("_");
    var idx2 = aInputName.indexOf("_", idx1 + 1);

    return parseInt(aInputName.substr(idx2 + 1));
}

function getAxisAsNrFromName(aInputName) {
    var idx1 = aInputName.indexOf("_");
    var idx2 = aInputName.indexOf("_", idx1 + 1);

    var result = -1;

    switch (aInputName.substr(idx2 + 1)) {
        case "X":
            result = 0;
            break;

        case "Y":
            result = 1;
            break;

        case "Z":
            result = 2;
            break;
    }

    return result;
}

function displayPreset() {
    $("#txtParticleCount").val(gPreset.ParticleCount);

    $("#txtBlur").val(gCanvas.blurradius);
    $("#txtBrightness").val(gCanvas.brightness);

    for (var n = 1; n <= 3; n++) {
        $("#txtAngle_" + n).val(gParSys.angle[n - 1]);
    }

    for (var n = 1; n <= 3; n++) {
        $("#txtRotation_" + n).val(gParSys.rotationSpeed3d[n - 1]);
    }

    // colors
    for (var n = 1; n <= 3; n++) {
        $("#txtColorBase_" + n).val(gParSys.colorBase[n - 1]);
    }

    for (var n = 1; n <= 3; n++) {
        $("#txtColorAmp_" + n).val(gParSys.colorAmp[n - 1]);
    }

    for (var n = 1; n <= 3; n++) {
        $("#txtColorFreq_" + n).val(gParSys.colorFreq[n - 1]);
    }

    for (var n = 1; n <= 3; n++) {
        $("#txtColorShift_" + n).val(gParSys.colorShift[n - 1]);
    }

    // waves
    for (var n = 0; n < MAX_WAVE_CNT; n++) {
        for (var i = 0; i < AXIS_CNT; i++) {
            var waveAxisStr = "_" + (n + 1).toString() + "_" + AXIS_NAME[i];

            $("#txtWavePhase" + waveAxisStr).val(gParSys.waves[n][i].phase);
            $("#txtWaveBaseAM" + waveAxisStr).val(gParSys.waves[n][i].am.base);
            $("#txtWaveAmpAM" + waveAxisStr).val(gParSys.waves[n][i].am.amp);
            $("#txtWaveFreqAM" + waveAxisStr).val(gParSys.waves[n][i].am.freq);
            $("#txtWaveBaseFM" + waveAxisStr).val(gParSys.waves[n][i].fm.base);
            $("#txtWaveAmpFM" + waveAxisStr).val(gParSys.waves[n][i].fm.amp);
            $("#txtWaveFreqFM" + waveAxisStr).val(gParSys.waves[n][i].fm.freq);
        }
    }

    // transmaps
    $("#lstTransMapStyle").val(gPreset.TransMapStyle);

    $("#chkTransMapFilter").prop("checked", gTransMapFilter);
    $("#chkTransMapMode").prop("checked", gTransMapMode == TransMapMode.tmmApplyBefore);

    $("#txtTransMapCenterX").val(gPreset.ZoomCenterX);
    $("#txtTransMapCenterY").val(gPreset.ZoomCenterY);

    for (var n = 0; n < MAX_SIN_MAGIC; n++) {
        var waveStr = "_" + (n + 1).toString();

        $("#txtXAmp_1" + waveStr).val(gPreset.SinMagicParams[0][n]);
        $("#txtXFreq_1" + waveStr).val(gPreset.SinMagicParams[1][n]);
        $("#txtYAmp_1" + waveStr).val(gPreset.SinMagicParams[2][n]);
        $("#txtYFreq_1" + waveStr).val(gPreset.SinMagicParams[3][n]);

        $("#txtXAmp_2" + waveStr).val(gPreset.SinMagicParams2[0][n]);
        $("#txtXFreq_2" + waveStr).val(gPreset.SinMagicParams2[1][n]);
        $("#txtYAmp_2" + waveStr).val(gPreset.SinMagicParams2[2][n]);
        $("#txtYFreq_2" + waveStr).val(gPreset.SinMagicParams2[3][n]);
    }
}


function start() {
    $("#cmdToggleSettings").click(function () {
        $("#pnlSettings").toggle();
    });

    $.each(g_psss_presets, function (actName, actPreset) {
        $("#lstParticlePresets").append(
            $('<option></option>').val(actName).html(actName)
        );
    });

    $("#lstParticlePresets").change(function () {
        var selVal = $(this).val();

        if (selVal) {
            selectPreset(selVal);

            displayPreset();
        }
    });

    $("#txtParticleCount").change(function () {
        var v = parseInt($(this).val());

        gPreset.ParticleCount=v;

        applyPreset();
    });

    // display filter
    $("#txtBlur").change(function () {
        gCanvas.blurradius = parseFloat($("#txtBlur").val());
    });

    $("#txtBrightness").change(function () {
        gCanvas.brightness = parseFloat($("#txtBrightness").val());
    });

    // angle 
    $(".txtAngle").change(function () {
        var name = $(this).attr('name');
        var v = parseFloat($(this).val());

        var axis = get1stFromName(name) - 1;

        gParSys.angle[axis] = v;
    });

    $(".txtRotation").change(function () {
        var name = $(this).attr('name');
        var v = parseFloat($(this).val());

        var axis = get1stFromName(name) - 1;

        gParSys.rotationSpeed3d[axis] = v;
    });

    // colors
    $(".colorBase").change(function () {
        var name = $(this).attr('name');
        var v = parseFloat($(this).val());

        var i = name.substr(name.length - 1) - 1;
        gParSys.colorBase[i] = v;
    });

    $(".colorAmp").change(function () {
        var name = $(this).attr('name');
        var v = parseFloat($(this).val());

        var i = name.substr(name.length - 1) - 1;
        gParSys.colorAmp[i] = v;
    });

    $(".colorFreq").change(function () {
        var name = $(this).attr('name');
        var v = parseFloat($(this).val());

        var i = name.substr(name.length - 1) - 1;
        gParSys.colorFreq[i] = v;
    });

    $(".colorShift").change(function () {
        var name = $(this).attr('name');
        var v = parseFloat($(this).val());

        var i = name.substr(name.length - 1) - 1;
        gParSys.colorShift[i] = v;
    });

    // waves
    $(".wavePhase").change(function () {
        var name = $(this).attr('name');
        var v = parseFloat($(this).val());

        var waveNr = get1stFromName(name) - 1;
        var waveAxis = getAxisAsNrFromName(name);

        gParSys.waves[waveNr][waveAxis].phase = v;
    });

    $(".cmdWaveZero").click(function () {
        var name = $(this).attr('name');

        var waveNr = get1stFromName(name) - 1;
        var waveAxis = getAxisAsNrFromName(name);

        gParSys.waves[waveNr][waveAxis].phase = 0;
        gParSys.waves[waveNr][waveAxis].am.base = 0;
        gParSys.waves[waveNr][waveAxis].am.amp = 0;
        gParSys.waves[waveNr][waveAxis].am.freq = 0;
        gParSys.waves[waveNr][waveAxis].fm.base = 0;
        gParSys.waves[waveNr][waveAxis].fm.amp = 0;
        gParSys.waves[waveNr][waveAxis].fm.freq = 0;

        displayPreset();
    });

    $(".waveBaseAM").change(function () {
        var name = $(this).attr('name');
        var v = parseFloat($(this).val());

        var waveNr = get1stFromName(name) - 1;
        var waveAxis = getAxisAsNrFromName(name);

        gParSys.waves[waveNr][waveAxis].am.base = v;
    });

    $(".waveBaseFM").change(function () {
        var name = $(this).attr('name');
        var v = parseFloat($(this).val());

        var waveNr = get1stFromName(name) - 1;
        var waveAxis = getAxisAsNrFromName(name);

        gParSys.waves[waveNr][waveAxis].fm.base = v;
    });

    $(".waveAmpAM").change(function () {
        var name = $(this).attr('name');
        var v = parseFloat($(this).val());

        var waveNr = get1stFromName(name) - 1;
        var waveAxis = getAxisAsNrFromName(name);

        gParSys.waves[waveNr][waveAxis].am.amp = v;
    });

    $(".waveAmpFM").change(function () {
        var name = $(this).attr('name');
        var v = parseFloat($(this).val());

        var waveNr = get1stFromName(name) - 1;
        var waveAxis = getAxisAsNrFromName(name);

        gParSys.waves[waveNr][waveAxis].fm.amp = v;
    });

    $(".waveFreqAM").change(function () {
        var name = $(this).attr('name');
        var v = parseFloat($(this).val());

        var waveNr = get1stFromName(name) - 1;
        var waveAxis = getAxisAsNrFromName(name);

        gParSys.waves[waveNr][waveAxis].am.freq = v;
    });

    $(".waveFreqFM").change(function () {
        var name = $(this).attr('name');
        var v = parseFloat($(this).val());

        var waveNr = get1stFromName(name) - 1;
        var waveAxis = getAxisAsNrFromName(name);

        gParSys.waves[waveNr][waveAxis].fm.freq = v;
    });

    // transmaps
    $("#lstTransMapStyle").change(function () {
        var v = parseInt($(this).val());

        gTransMapStyle = v;

        calcTransMap();
    });


    $("#chkTransMapFilter").change(function () {
        gTransMapFilter = $("#chkTransMapFilter").is(':checked');
    });

    $("#chkTransMapMode").change(function () {
        gTransMapMode = $("#chkTransMapMode").is(':checked') ? TransMapMode.tmmApplyBefore : TransMapMode.tmmApplyAfter;
    });

    $("#txtTransMapCenterX").change(function () {
        var v = parseFloat($(this).val());

        gPreset.ZoomCenterX = v;

        calcTransMap();
    });

    $("#txtTransMapCenterY").change(function () {
        var v = parseFloat($(this).val());

        gPreset.ZoomCenterY = v;

        calcTransMap();
    });

    $("#chkTransMapMode").change(function () {
        gTransMapMode = $("#chkTransMapMode").is(':checked') ? TransMapMode.tmmApplyBefore : TransMapMode.tmmApplyAfter;
    });

    $(".txtTransXAmp").change(function () {
        var name = $(this).attr('name');
        var v = parseFloat($(this).val());

        var trMapNr = get1stFromName(name);
        var waveNr = get2ndFromName(name) - 1;

        switch (trMapNr) {
            case 1:
                gPreset.SinMagicParams[0][waveNr] = v;
                break;

            case 2:
                gPreset.SinMagicParams2[0][waveNr] = v;
                break;
        }

        calcTransMap();
    });

    $(".txtTransXFreq").change(function () {
        var name = $(this).attr('name');
        var v = $(this).val();

        var trMapNr = get1stFromName(name);
        var waveNr = get2ndFromName(name) - 1;

        switch (trMapNr) {
            case 1:
                gPreset.SinMagicParams[1][waveNr] = v;
                break;

            case 2:
                gPreset.SinMagicParams2[1][waveNr] = v;
                break;
        }

        calcTransMap();
    });

    $(".txtTransYAmp").change(function () {
        var name = $(this).attr('name');
        var v = $(this).val();

        var trMapNr = get1stFromName(name);
        var waveNr = get2ndFromName(name) - 1;

        switch (trMapNr) {
            case 1:
                gPreset.SinMagicParams[2][waveNr] = v;
                break;

            case 2:
                gPreset.SinMagicParams2[2][waveNr] = v;
                break;
        }

        calcTransMap();
    });

    $(".txtTransYFreq").change(function () {
        var name = $(this).attr('name');
        var v = $(this).val();

        var trMapNr = get1stFromName(name);
        var waveNr = get2ndFromName(name) - 1;

        switch (trMapNr) {
            case 1:
                gPreset.SinMagicParams[3][waveNr] = v;
                break;

            case 2:
                gPreset.SinMagicParams2[3][waveNr] = v;
                break;
        }

        calcTransMap();
    });

    //
    $("#world").data("origWidth",$("#world").width());
    $("#world").data("origHeight",$("#world").height());
    $("#world").data("fullscreen",false);

    $("#world").click(function () {     
        if(!$("#world").data("fullscreen")) {
            $("#world").width(window.innerWidth);
            $("#world").height(window.innerHeight);
            
            $('#world').css({ 
                position: "absolute",
                marginLeft: 0, marginTop: 0,
                top: 0, left: 0
            });

            // enter fullscreen
            if ($('#world')[0].requestFullscreen) {
                $('#world')[0].requestFullscreen();
            } else if ($('#world')[0].webkitRequestFullscreen) { /* Safari */
                $('#world')[0].webkitRequestFullscreen();
            } else if ($('#world')[0].msRequestFullscreen) { /* IE11 */
                $('#world')[0].msRequestFullscreen();
            }

            $("#world").data("fullscreen",true);
        } else {
            $("#world").width($("#world").data("origWidth"));
            $("#world").height($("#world").data("origHeight"));
            
            $('#world').css({ 
                position: "relative"
            });

            // exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { /* Safari */
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { /* IE11 */
                document.msExitFullscreen();
            }

            $("#world").data("fullscreen",false);
        }        
    });

    //
    $("#pnlSettings").toggle();
    var defSelect='Quantum Mathematic';
    $("#lstParticlePresets").val(defSelect);   
    selectPreset(defSelect);
    displayPreset();    
}

//------------------------------------------------------------------------------
window.onload = function () {
    start();
};