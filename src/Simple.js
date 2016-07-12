var CANVAS_ID = "glcanvas"; // CANVASID
var CAN_SIZE = 512;         // CANVASサイズ
var fbuffer  = [];          // オフスクリーン用のバッファ
var ftexture = [];          // オフスクリーン用のテクスチャ
var program  = [];          // プログラムオブジェクト
var glCanvas = null;
var count = 0;              // カウンタ

// Live2Dモデル定義
var MODEL_PATH = "assets/haru/";
var MODEL_DEFINE = {
    "type":"Live2D Model Setting",
    "name":"haru",
    "model": MODEL_PATH + "haru.moc",
    "textures":[
        MODEL_PATH + "haru.1024/texture_00.png",
        MODEL_PATH + "haru.1024/texture_01.png",
        MODEL_PATH + "haru.1024/texture_02.png",
    ],
    "motions":[
        MODEL_PATH + "motions/idle_00.mtn",
        MODEL_PATH + "motions/tapBody_06.mtn",
        MODEL_PATH + "motions/tapBody_09.mtn",
    ],
    "drawid":[
        "D_EYE_BALL_001.03", "D_EYE_BALL_001.00",
    ],
};


// JavaScriptで発生したエラーを取得
window.onerror = function(msg, url, line, col, error) {
    var errmsg = "line:" + line + " " + msg;
    console.error(errmsg);
}

/*
 * メイン処理
 */
window.onload = function(){
    glCanvas = new Simple();
}

var Simple = function() {
    // Live2Dモデルのインスタンス
    this.live2DModel = null;
    // アニメーションを停止するためのID
    this.requestID = null;
    // モデルのロードが完了したら true
    this.loadLive2DCompleted = false;
    // モデルの初期化が完了したら true
    this.initLive2DCompleted = false;
    // WebGL Image型オブジェクトの配列
    this.loadedImages = [];
    // モーション
    this.motions = [];
    // モーション管理マネジャー
    this.motionMgr = null;
    // モーション番号
    this.motionnm = 0;
    // モーションチェンジ
    this.motionchange = false;
    // Live2D モデル設定。
    this.modelDef = MODEL_DEFINE;
    // エフェクト番号
    this.effectnm = 0;

    // ドラッグによるアニメーションの管理
    this.dragMgr = null;        /*new L2DTargetPoint();*/
    this.viewMatrix = null;     /*new L2DViewMatrix();*/
    this.projMatrix = null;     /*new L2DMatrix44()*/
    this.deviceToScreen = null; /*new L2DMatrix44();*/
    this.drag = false;          // ドラッグ中かどうか
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.dragX      = 0;
    this.dragY      = 0;

    // エフェクト描画用の中心座標
    this.centerpos = [];
    // モデルのスケール(体の全体表示は1.0。その場合はエフェクトサイズも調整必要)
    this.scale = 3.0;

    // Live2Dの初期化
    Live2D.init();

    // canvasオブジェクトを取得
    this.canvas = document.getElementById(CANVAS_ID);
    this.canvas.height = this.canvas.width = CAN_SIZE;

    // コンテキストを失ったとき
    this.canvas.addEventListener("webglcontextlost", function(e) {
        this.myerror("context lost");
        this.loadLive2DCompleted = false;
        this.initLive2DCompleted = false;

        var cancelAnimationFrame =
            window.cancelAnimationFrame ||
            window.mozCancelAnimationFrame;
        cancelAnimationFrame(this.requestID); //アニメーションを停止

        e.preventDefault();
    }, false);

    // コンテキストが復元されたとき
    this.canvas.addEventListener("webglcontextrestored" , function(e){
        console.myerror("webglcontext restored");
        this.initLoop(this.canvas);
    }, false);

    // 3Dバッファの初期化
    var width = this.canvas.width;
    var height = this.canvas.height;
    // ビュー行列
    var ratio = height / width;
    var left = -1.0;
    var right = 1.0;
    var bottom = -ratio;
    var top = ratio;

    // ドラッグ用のクラス
    this.dragMgr = new L2DTargetPoint();
    // Live2DのView座標クラス
    this.viewMatrix = new L2DViewMatrix();

    // デバイスに対応する画面の範囲。 Xの左端, Xの右端, Yの下端, Yの上端
    this.viewMatrix.setScreenRect(left, right, bottom, top);
    // デバイスに対応する画面の範囲。 Xの左端, Xの右端, Yの下端, Yの上端
    this.viewMatrix.setMaxScreenRect(-2.0, 2.0, -2.0, 2.0);
    this.viewMatrix.setMaxScale(2.0);
    this.viewMatrix.setMinScale(0.8);

    // Live2Dの座標系クラス
    this.projMatrix = new L2DMatrix44();
    this.projMatrix.multScale(1, (width / height));

    // マウス用スクリーン変換行列
    this.deviceToScreen = new L2DMatrix44();
    this.deviceToScreen.multTranslate(-width / 2.0, -height / 2.0);
    this.deviceToScreen.multScale(2 / width, -2 / width);

    // モーションマネジャーのインスタンス化
    this.motionMgr = new L2DMotionManager();

    // Init and start Loop
    this.initLoop(this.canvas);
};


/*
* WebGLコンテキストを取得・初期化。
* Live2Dの初期化、描画ループを開始。
*/
Simple.prototype.initLoop = function(canvas/*HTML5 canvasオブジェクト*/)
{
    //------------ WebGLの初期化 ------------

    // WebGLのコンテキストを取得する
    var para = {
        premultipliedAlpha : true,
//        alpha : false
    };
    var gl = this.getWebGLContext(canvas, para);
    if (!gl) {
        this.myerror("Failed to create WebGL context.");
        return;
    }
    // OpenGLのコンテキストをセット
    Live2D.setGL(gl);

    // 描画エリアを白でクリア
    gl.clearColor( 0.0 , 0.0 , 0.0 , 0.0 );
    // コールバック対策
    var that = this;

    //------------ Live2Dの初期化 ------------
    // mocファイルからLive2Dモデルのインスタンスを生成
    this.loadBytes(this.modelDef.model, function(buf){
        that.live2DModel = Live2DModelWebGL.loadModel(buf);
    });

    // テクスチャの読み込み
    var loadCount = 0;
    for(var i = 0; i < this.modelDef.textures.length; i++){
        (function ( tno ){// 即時関数で i の値を tno に固定する（onerror用)
            that.loadedImages[tno] = new Image();
            that.loadedImages[tno].src = that.modelDef.textures[tno];
            that.loadedImages[tno].onload = function(){
                if((++loadCount) == that.modelDef.textures.length) {
                    that.loadLive2DCompleted = true;//全て読み終わった
                }
            }
            that.loadedImages[tno].onerror = function() {
                that.myerror("Failed to load image : " + that.modelDef.textures[tno]);
            }
        })( i );
    }

    // モーションのロード
    for(var i = 0; i < this.modelDef.motions.length; i++){
        this.loadBytes(that.modelDef.motions[i], function(buf){
            that.motions.push(Live2DMotion.loadMotion(buf));
        });
    }

    // モーションチェンジボタン
    this.motionbtn = document.getElementById("motionbtn");
    this.motionbtn.addEventListener("click", function(e){
        that.motionchange = true;
        if(that.motions.length - 1  > that.motionnm){
            that.motionnm++;
        }else{
            that.motionnm = 0;
        }
    }, false);
    // マウスドラッグのイベント
    this.canvas.addEventListener("mousedown", function(e){that.mouseEvent(e, that)}, false);
    this.canvas.addEventListener("mousemove", function(e){that.mouseEvent(e, that)}, false);
    this.canvas.addEventListener("mouseup", function(e){that.mouseEvent(e, that)}, false);
    this.canvas.addEventListener("mouseout", function(e){that.mouseEvent(e, that)}, false);

    // カラーチェンジボタン
    this.effectbtn = document.getElementById("effectbtn");
    this.effectbtn.addEventListener("click", function(e){
        that.effectnm++;
    }, false);

    // フレームバッファ用の初期化処理
    this.Init_framebuffer(gl);
    // VBOとIBOの初期化処理
    this.off_pro = new Simple.shaderProperty(gl, that, this.off_prg, true, true);
    // エフェクト描画の初期化処理
    this.effect_pro = new Simple.shaderProperty(gl, that, this.effect_prg, false, false);

    // 各種行列の生成と初期化
    this.m = new matIV();
    this.mMatrix   = this.m.identity(this.m.create());
    this.vMatrix   = this.m.identity(this.m.create());
    this.pMatrix   = this.m.identity(this.m.create());
    this.tmpMatrix = this.m.identity(this.m.create());
    this.mvpMatrix = this.m.identity(this.m.create());

    //------------ 描画ループ ------------
    (function tick() {
        that.draw(gl, that); // 1回分描画

        var requestAnimationFrame =
            window.requestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            window.msRequestAnimationFrame;
            requestID = requestAnimationFrame( tick , that.canvas );// 一定時間後に自身を呼び出す
    })();
};


Simple.prototype.draw = function(gl/*WebGLコンテキスト*/, that)
{
    // Live2D初期化
    if( ! that.live2DModel || ! that.loadLive2DCompleted )
    return; //ロードが完了していないので何もしないで返る

    // ロード完了後に初回のみ初期化する
    if( ! that.initLive2DCompleted ){
        that.initLive2DCompleted = true;

        // 画像からWebGLテクスチャを生成し、モデルに登録
        for( var i = 0; i < that.loadedImages.length; i++ ){
            //Image型オブジェクトからテクスチャを生成
            var texName = that.createTexture(gl, that.loadedImages[i]);
            that.live2DModel.setTexture(i, texName); //モデルにテクスチャをセット
        }

        // テクスチャの元画像の参照をクリア
        that.loadedImages = null;

        // 表示位置を指定するための行列を定義する
        var w = that.live2DModel.getCanvasWidth();
        var h = that.live2DModel.getCanvasHeight() / that.scale;
        var s = 2.0 / h;    // canvas座標を-1.0〜1.0になるように正規化
        var p = w / h;      // この計算でModelerのcanvasサイズを元に位置指定できる
        var matrix4x4 = [
            s, 0, 0, 0,
            0,-s, 0, 0,
            0, 0, 1, 0,
           -p, 1, 0, 1 ];
           that.live2DModel.setMatrix(matrix4x4);
    }

    // モーションが終了していたら再生する
    if(that.motionMgr.isFinished() || that.motionchange == true ){
        that.motionMgr.startMotion(that.motions[that.motionnm], 0);
        that.motionchange = false;
    }
    // モーション指定されていない場合は何も再生しない
    if(that.motionnm != null){
        // モーションパラメータの更新
        that.motionMgr.updateParam(that.live2DModel);
    }

    // ドラッグ用パラメータの更新
    that.dragMgr.update();
    that.dragX = that.dragMgr.getX();
    that.dragY = that.dragMgr.getY();

    // ドラッグによる体の向きの調整(-30から30の値を加える)
    that.live2DModel.setParamFloat("PARAM_ANGLE_X", that.dragX * 30);
    that.live2DModel.setParamFloat("PARAM_ANGLE_Y", that.dragY * 30);
    // ドラッグによる体の向きの調整(-10から10の値を加える)
    that.live2DModel.setParamFloat("PARAM_BODY_ANGLE_X", that.dragX*10);
    // ドラッグによる目の向きの調整(-1から1の値を加える)
    that.live2DModel.setParamFloat("PARAM_EYE_BALL_X", that.dragX);
    that.live2DModel.setParamFloat("PARAM_EYE_BALL_Y", that.dragY);
    // キャラクターのパラメータを適当に更新(1秒ごとに2π(1周期)増える)
    var t = UtSystem.getTimeMSec() * 0.001 * 2 * Math.PI;
    var cycle = 3.0; //パラメータが一周する時間(秒)
    // 呼吸する
    that.live2DModel.setParamFloat("PARAM_BREATH", 0.5 + 0.5 * Math.sin(t/cycle));
    // 左目開閉
    var openEyeL = that.live2DModel.getParamFloat("PARAM_EYE_L_OPEN");

    // ビュー×プロジェクション座標変換行列
    that.m.lookAt([0.0, 0.0, 2.6], [0, 0, 0], [0, 1, 0], that.vMatrix);
    that.m.perspective(45, CAN_SIZE / CAN_SIZE, 0.1, 100, that.pMatrix);
    that.m.multiply(that.pMatrix, that.vMatrix, that.tmpMatrix);

    count+= 0.1;    // エフェクトのアニメーション用

    //***** フレームバッファ0をバインドする *****//
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbuffer[0].framebuffer);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Live2Dモデルを更新して描画
    that.live2DModel.update();  // 現在のパラメータに合わせて頂点等を計算
    that.live2DModel.draw();	// 描画


    //***** フレームバッファ1のバインドする *****//
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbuffer[1].framebuffer);
    // canvasを初期化
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // シェーダー切り替え
    gl.useProgram(that.effect_prg);
    // VBOとIBOの登録
    that.set_attribute(gl, that.effect_pro.VBOList, that.effect_pro.attLocation, that.effect_pro.attStride);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, that.effect_pro.iIndex);
    // モデル座標変換行列の生成
    that.m.identity(that.mMatrix);
    // 表示位置
    that.m.translate(that.mMatrix, [-0.0, -0.00, 0.0], that.mMatrix);
    // 拡大縮小
    that.m.scale(that.mMatrix, [1.1, 1.1, 0.0], that.mMatrix);
    // 行列の掛け合わせ
    that.m.multiply(that.tmpMatrix, that.mMatrix, that.mvpMatrix);
    gl.uniformMatrix4fv(that.effect_pro.uniLocation[0], false, that.mvpMatrix);
    // 描画オブジェクトのセンター座標を取得する
    that.draw_center(gl, that.live2DModel, that);
    // uniform変数にテクスチャを登録
    gl.uniform1i(that.effect_pro.uniLocation[1], false);    // シェーダー反転するかどうか
    gl.uniform1f(that.effect_pro.uniLocation[2], count);    // time
    gl.uniform2fv(that.effect_pro.uniLocation[3], [CAN_SIZE, CAN_SIZE]);    // 解像度
    gl.uniform2fv(that.effect_pro.uniLocation[4], [-that.centerpos[0], that.centerpos[1]]); // 右目エフェクト
    gl.uniform2fv(that.effect_pro.uniLocation[5], [-that.centerpos[2], that.centerpos[3]]); // 左目エフェクト
    gl.uniform1i(that.effect_pro.uniLocation[6], that.effectnm % 2);    // エフェクト切替

    gl.uniform1f(that.effect_pro.uniLocation[7], openEyeL);    // 左目開閉
    // uniform変数の登録と描画
    gl.drawElements(gl.TRIANGLES, that.effect_pro.index.length, gl.UNSIGNED_SHORT, 0);


    //***** フレームバッファのバインドを解除 *****//
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // シェーダー切り替え
    gl.useProgram(that.off_prg);
    // canvasを初期化
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // VBOとIBOの登録
    that.set_attribute(gl, that.off_pro.VBOList, that.off_pro.attLocation, that.off_pro.attStride);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, that.off_pro.iIndex);
    // モデル座標変換行列の生成
    that.m.identity(that.mMatrix);
    // 表示位置
    that.m.translate(that.mMatrix, [0.0, 0.0, 0.0], that.mMatrix);
    // 拡大縮小
    that.m.scale(that.mMatrix, [1.0, 1.0, 0.0], that.mMatrix);
    that.m.multiply(that.tmpMatrix, that.mMatrix, that.mvpMatrix);
    // uniform変数の登録と描画
    gl.uniformMatrix4fv(that.off_pro.uniLocation[0], false, that.mvpMatrix);
    // uniform変数にテクスチャを登録
    gl.uniform1i(that.off_pro.uniLocation[1], true);  // シェーダー反転するかどうか
    gl.uniform1i(that.off_pro.uniLocation[2], true);  // マルチテクスチャかどうか
    // フレームバッファのテクスチャをバインド
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ftexture[0]);
    gl.uniform1i(that.off_pro.uniLocation[3], 0);     // テクスチャ0
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ftexture[1]);
    gl.uniform1i(that.off_pro.uniLocation[4], 1);     // テクスチャ1
    gl.activeTexture(gl.TEXTURE0);
    gl.drawElements(gl.TRIANGLES, that.off_pro.index.length, gl.UNSIGNED_SHORT, 0);
};


/*
* WebGLのコンテキストを取得する
*/
Simple.prototype.getWebGLContext = function(canvas/*HTML5 canvasオブジェクト*/)
{
    var NAMES = [ "webgl" , "experimental-webgl" , "webkit-3d" , "moz-webgl"];

    var param = {
        alpha : true,
        premultipliedAlpha : true
    };

    for( var i = 0; i < NAMES.length; i++ ){
            try{
                var ctx = canvas.getContext( NAMES[i], param );
                if( ctx ) return ctx;
            }
            catch(e){}
    }
    return null;
};


/*
* Image型オブジェクトからテクスチャを生成
*/
Simple.prototype.createTexture = function(gl/*WebGLコンテキスト*/, image/*WebGL Image*/)
{
    var texture = gl.createTexture(); //テクスチャオブジェクトを作成する
    if ( !texture ){
        console.warn("Failed to generate gl texture name.");
        return -1;
    }

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);	//imageを上下反転
    gl.activeTexture( gl.TEXTURE0 );
    gl.bindTexture( gl.TEXTURE_2D , texture );
    gl.texImage2D( gl.TEXTURE_2D , 0 , gl.RGBA , gl.RGBA , gl.UNSIGNED_BYTE , image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture( gl.TEXTURE_2D , null );

    return texture;
};


/*
* ファイルをバイト配列としてロードする
*/
Simple.prototype.loadBytes = function(path , callback)
{
    var request = new XMLHttpRequest();
    request.open("GET", path , true);
    request.responseType = "arraybuffer";
    request.onload = function(){
        switch( request.status ){
        case 200:
            callback( request.response );
            break;
        default:
            Simple.myerror( "Failed to load (" + request.status + ") : " + path );
            break;
        }
    }
    request.send(null);
};



/*
 * マウスイベント
 */
Simple.prototype.mouseEvent = function(e, that)
{
    e.preventDefault();

    // マウスダウン時
    if (e.type == "mousedown") {
        // 左クリック以外なら処理を抜ける
        if("button" in e && e.button != 0) return;
        that.modelTurnHead(e);

    // マウス移動時
    } else if (e.type == "mousemove") {
        that.followPointer(e);

    // マウスアップ時
    } else if (e.type == "mouseup") {
        // 左クリック以外なら処理を抜ける
        if("button" in e && e.button != 0) return;
        if (that.drag){
            that.drag = false;
        }
        that.dragMgr.setPoint(0, 0);

    // CANVAS外にマウスがいった時
    } else if (e.type == "mouseout") {
        if (that.drag)
        {
            that.drag = false;
        }
        that.dragMgr.setPoint(0, 0);
    }
};

/*
 * クリックされた方向を向く
 * タップされた場所に応じてモーションを再生
 */
Simple.prototype.modelTurnHead = function(e)
{
    this.drag = true;
    var rect = e.target.getBoundingClientRect();

    var sx = this.transformScreenX(e.clientX - rect.left);
    var sy = this.transformScreenY(e.clientY - rect.top);
    var vx = this.transformViewX(e.clientX - rect.left);
    var vy = this.transformViewY(e.clientY - rect.top);

    this.lastMouseX = sx;
    this.lastMouseY = sy;
    this.dragMgr.setPoint(vx, vy); // その方向を向く
};

/*
 * マウスを動かした時のイベント
 */
Simple.prototype.followPointer = function(e)
{
    var rect = e.target.getBoundingClientRect();

    var sx = this.transformScreenX(e.clientX - rect.left);
    var sy = this.transformScreenY(e.clientY - rect.top);
    var vx = this.transformViewX(e.clientX - rect.left);
    var vy = this.transformViewY(e.clientY - rect.top);

    if (this.drag)
    {
        this.lastMouseX = sx;
        this.lastMouseY = sy;
        this.dragMgr.setPoint(vx, vy); // その方向を向く
    }
};


Simple.prototype.transformViewX = function(deviceX)
{
    var screenX = this.deviceToScreen.transformX(deviceX);  // 論理座標変換した座標を取得。
    return this.viewMatrix.invertTransformX(screenX);       // 拡大、縮小、移動後の値。
};

Simple.prototype.transformViewY = function(deviceY)
{
    var screenY = this.deviceToScreen.transformY(deviceY);  // 論理座標変換した座標を取得。
    return this.viewMatrix.invertTransformY(screenY);       // 拡大、縮小、移動後の値。
};

Simple.prototype.transformScreenX = function(deviceX)
{
    return this.deviceToScreen.transformX(deviceX);
};

Simple.prototype.transformScreenY = function(deviceY)
{
    return this.deviceToScreen.transformY(deviceY);
};


/*
* フレームバッファの初期化処理
*/
Simple.prototype.Init_framebuffer = function(gl)
{
    // 頂点シェーダとフラグメントシェーダの生成
    var off_v_shader = this.create_shader(gl, 'vs');
    var off_f_shader = this.create_shader(gl, 'fs');
    var effect_v_shader = this.create_shader(gl, 'effect_vs');
    var effect_f_shader = this.create_shader(gl, 'effect_fs');
    // プログラムオブジェクトの生成とリンク
    this.off_prg = this.create_program(gl, off_v_shader, off_f_shader, 0, true);
    this.effect_prg = this.create_program(gl, effect_v_shader, effect_f_shader, 1, false);
    // 深度テストを有効にする
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1.0);
    // フレームバッファを生成
    fbuffer[0] = this.create_framebuffer(gl, CAN_SIZE, CAN_SIZE, 0, false);
    fbuffer[1] = this.create_framebuffer(gl, CAN_SIZE, CAN_SIZE, 1, false);
};

/*
* VBOとIBOの初期化処理
*/
Simple.shaderProperty = function(gl, that, prg, multi_tex, reversal)
{
    // attributeLocationを配列に取得
    this.attLocation = new Array();
    if(multi_tex == true){
        this.attLocation[0] = gl.getAttribLocation(prg, 'position');
        this.attLocation[1] = gl.getAttribLocation(prg, 'color');
        this.attLocation[2] = gl.getAttribLocation(prg, 'textureCoord');
    }else{
        // エフェクトシェーダーの場合、カラーとテクスチャ座標は不要
        this.attLocation[0] = gl.getAttribLocation(prg, 'position');
    }
    // attributeの要素数を配列に格納
    this.attStride = new Array();
    if(multi_tex == true){
        this.attStride[0] = 3;
        this.attStride[1] = 4;
        this.attStride[2] = 2;
    }else{
        // エフェクトシェーダーの場合、カラーとテクスチャ座標は不要
        this.attStride[0] = 3;
    }
    // 頂点の位置
    this.position = [
        -1.0,  1.0,  0.0,
         1.0,  1.0,  0.0,
        -1.0, -1.0,  0.0,
         1.0, -1.0,  0.0
    ];
    // 頂点色
    this.color = [
        1.0, 1.0, 1.0, 1.0,
        1.0, 1.0, 1.0, 1.0,
        1.0, 1.0, 1.0, 1.0,
        1.0, 1.0, 1.0, 1.0
    ];
    // テクスチャ座標
    this.textureCoord = [
        0.0, 0.0,
        1.0, 0.0,
        0.0, 1.0,
        1.0, 1.0
    ];
    // 頂点インデックス
    this.index = [
        0, 1, 2,
        3, 2, 1
    ];
    // VBOとIBOの生成
    this.vPosition     = that.create_vbo(gl, this.position);
    this.vColor        = that.create_vbo(gl, this.color);
    this.vTextureCoord = that.create_vbo(gl, this.textureCoord);
    if(multi_tex == true){
        this.VBOList   = [this.vPosition, this.vColor, this.vTextureCoord];
    }else{
        // エフェクトシェーダーの場合、カラーとテクスチャ座標は不要
        this.VBOList   = [this.vPosition];
    }
    this.iIndex        = that.create_ibo(gl, this.index);
    // VBOとIBOの登録
    that.set_attribute(gl, this.VBOList, this.attLocation, this.attStride);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndex);
    // uniformLocationを配列に取得
    this.uniLocation = new Array();
    this.uniLocation[0]  = gl.getUniformLocation(prg, 'mvpMatrix');
    this.uniLocation[1]  = gl.getUniformLocation(prg, 'reversal');

    if(multi_tex == true){
        this.uniLocation[2]  = gl.getUniformLocation(prg, 'multi_tex');
        this.uniLocation[3]  = gl.getUniformLocation(prg, 'texture0');
        this.uniLocation[4]  = gl.getUniformLocation(prg, 'texture1');
    }else{
        this.uniLocation[2]  = gl.getUniformLocation(prg, 'time');
        this.uniLocation[3]  = gl.getUniformLocation(prg, 'resolution');
        this.uniLocation[4]  = gl.getUniformLocation(prg, 'center[0]');
        this.uniLocation[5]  = gl.getUniformLocation(prg, 'center[1]');
        this.uniLocation[6]  = gl.getUniformLocation(prg, 'effectnm');
        this.uniLocation[7]  = gl.getUniformLocation(prg, 'effecton');
    }
};

/*
* シェーダーコンパイル
*/
Simple.prototype.create_shader = function(gl, id)
{
    // シェーダを格納する変数
    var shader;
    // HTMLからscriptタグへの参照を取得
    var scriptElement = document.getElementById(id);
    // scriptタグが存在しない場合は抜ける
    if(!scriptElement){return;}
    // scriptタグのtype属性をチェック
    switch(scriptElement.type){
        // 頂点シェーダの場合
        case 'x-shader/x-vertex':
            shader = gl.createShader(gl.VERTEX_SHADER);
            break;
        // フラグメントシェーダの場合
        case 'x-shader/x-fragment':
            shader = gl.createShader(gl.FRAGMENT_SHADER);
            break;
        default :
            return;
    }
    // 生成されたシェーダにソースを割り当てる
    gl.shaderSource(shader, scriptElement.text);
    // シェーダをコンパイルする
    gl.compileShader(shader);
    // シェーダが正しくコンパイルされたかチェック
    if(gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
        // 成功していたらシェーダを返して終了
        return shader;
    }else{
        // 失敗していたらエラーログをアラートする
        alert(gl.getShaderInfoLog(shader));
    }
};

/*
 * プログラムオブジェクトを生成しシェーダをリンクする関数
 */
Simple.prototype.create_program = function(gl, vs, fs, index, link){
    // プログラムオブジェクトの生成
    program[index] = gl.createProgram();
    // プログラムオブジェクトにシェーダを割り当てる
    gl.attachShader(program[index], vs);
    gl.attachShader(program[index], fs);
    // シェーダをリンク
    gl.linkProgram(program[index]);
    // シェーダのリンクが正しく行なわれたかチェック
    if(gl.getProgramParameter(program[index], gl.LINK_STATUS)){
        if(link == true){
            // 成功していたらプログラムオブジェクトを有効にする
            gl.useProgram(program[index]);
        }
        // プログラムオブジェクトを返して終了
        return program[index];
    }else{
        // 失敗していたらエラーログをアラートする
        alert(gl.getProgramInfoLog(program[index]));
    }
};

/*
 * VBOを生成する関数
 */
Simple.prototype.create_vbo = function(gl, data){
    // バッファオブジェクトの生成
    var vbo = gl.createBuffer();
    // バッファをバインドする
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    // バッファにデータをセット
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    // バッファのバインドを無効化
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    // 生成した VBO を返して終了
    return vbo;
};

/*
 * VBOをバインドし登録する関数
 */
Simple.prototype.set_attribute = function(gl, vbo, attL, attS){
    // 引数として受け取った配列を処理する
    for(var i in vbo){
        // バッファをバインドする
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo[i]);
        // attributeLocationを有効にする
        gl.enableVertexAttribArray(attL[i]);
        // attributeLocationを通知し登録する
        gl.vertexAttribPointer(attL[i], attS[i], gl.FLOAT, false, 0, 0);
    }
};

/*
 * IBOを生成する関数
 */
Simple.prototype.create_ibo = function(gl, data){
    // バッファオブジェクトの生成
    var ibo = gl.createBuffer();
    // バッファをバインドする
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    // バッファにデータをセット
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Int16Array(data), gl.STATIC_DRAW);
    // バッファのバインドを無効化
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    // 生成したIBOを返して終了
    return ibo;
};

/*
 * フレームバッファを生成する
 */
Simple.prototype.create_framebuffer = function(gl, width, height, index){
    // フレームバッファオブジェクトの生成
    var framebuffer = gl.createFramebuffer();
    // フレームバッファをバインドする
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    // レンダーバッファオブジェクトの生成
    var depthrenderbuffer = gl.createRenderbuffer();
    // レンダーバッファをバインドする
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthrenderbuffer);
    // レンダーバッファのフォーマット設定
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    // フレームバッファへの深度バッファの関連付ける
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthrenderbuffer);
    // テクスチャオブジェクトの生成
    var frametexture = gl.createTexture();
    // テクスチャをバインドする
    gl.bindTexture(gl.TEXTURE_2D, frametexture);
    // テクスチャへイメージを適用
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    // テクスチャパラメーター
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    // フレームバッファにテクスチャを関連付ける
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frametexture, 0);
    // テクスチャのバインドを無効化
    gl.bindTexture(gl.TEXTURE_2D, null);
    // レンダーバッファのバインドを無効化
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    // フレームバッファのバインドを無効化
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // 生成したテクスチャをグローバル変数に代入
    ftexture[index] = frametexture;
    // 返り値
    return {framebuffer: framebuffer, depthrenderbuffer: depthrenderbuffer, texture:ftexture[index]};
};

/*
 * 描画オブジェクトの中心位置を求める
 */
Simple.prototype.draw_center = function(gl, live2DModel, that){
    // 描画オブジェクトIDリスト
    var drawidlist = [];
    // 配列をクリア
    that.centerpos = [];
    drawidlist = that.modelDef.drawid;
    // 指定した描画オブジェクトの数だけループ
    for(var i = 0; i < drawidlist.length; i++){
        // 頂点情報を取得(描画オブジェクトごとのID)
        var drawIndex = live2DModel.getDrawDataIndex(drawidlist[i]);
        // 頂点位置
        var points = live2DModel.getTransformedPoints(drawIndex);
        var w = live2DModel.getCanvasWidth();
        var h = live2DModel.getCanvasHeight() / this.scale;
        var p = w / h;  // ModelerのCanvas縦横サイズが違うもの対応
        // 初期化
        that.drawobj_pos_x = [];
        that.drawobj_pos_y = [];
        var index = 0;
        for (var j = 0; j < points.length; j+=2){
            // Canvasの解像度位置で返されるので、WebGL用に-1.0〜1.0の値に正規化
            that.drawobj_pos_x[index] = ((points[j] * 2.0 - w) / w) * p;   // X
            that.drawobj_pos_y[index] = ((points[j + 1] * 2.0 - h) / h);   // Y
            index++;
        }
        // 配列の中からX,Yの最大値と最小値を取得し、中心座標を求める
        var min_x = Math.min.apply(null, that.drawobj_pos_x);
        var max_x = Math.max.apply(null, that.drawobj_pos_x);
        var min_y = Math.min.apply(null, that.drawobj_pos_y);
        var max_y = Math.max.apply(null, that.drawobj_pos_y);
        var center_x = (min_x + max_x) / 2;
        var center_y = (min_y + max_y) / 2;
        that.centerpos.push(center_x);
        that.centerpos.push(center_y);
    }
};