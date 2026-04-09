const fs = require('fs');
const path = require('path');
const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');

const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

async function runJsonToVideoRender() {
    console.log("🚀 GitHub Actions: JSON to Remotion 엔진 가동!");

    // 💡 [수정됨] Base64 환경변수 대신 다운로드된 파일을 읽어옵니다.
    const dataFilePath = path.resolve(__dirname, process.env.DATA_FILE_PATH || 'render_data.json');
    
    if (!fs.existsSync(dataFilePath)) {
        console.error("❌ 다운로드된 데이터 파일이 없습니다!");
        process.exit(1);
    }

    let hugeData = {};
    try {
        const rawData = fs.readFileSync(dataFilePath, 'utf8');
        hugeData = JSON.parse(rawData);
    } catch (e) {
        console.error("❌ JSON 파일 파싱 실패:", e);
        process.exit(1);
    }

    const videoData = hugeData.previewData;
    const templateCode = hugeData.templateCodeStr;

    if (!videoData || !videoData.scenes) {
        console.error("❌ 유효한 비디오 데이터가 없습니다.");
        process.exit(1);
    }
    console.log(`[INFO] 파싱된 JSON 타이틀: ${videoData.title}`);

    if (templateCode) {
        const templatePath = path.resolve(__dirname, 'DynamicTemplate.jsx');
        fs.writeFileSync(templatePath, templateCode, 'utf8');
        console.log("[INFO] 백엔드에서 전달받은 DynamicTemplate.jsx를 생성 완료했습니다.");
    } else {
        console.error("❌ 템플릿 코드가 전달되지 않았습니다.");
        process.exit(1);
    }

    let totalFrames = 0;
    if (videoData.scenes && videoData.scenes.length > 0) {
        videoData.scenes.forEach(scene => {
            totalFrames += scene.durationInFrames || 90;
        });
    } else {
        totalFrames = 150;
    }

    const rootPath = path.resolve(__dirname, 'Root.jsx');
    const rootCode = `
        import React from 'react';
        import { Composition } from 'remotion';
        import DynamicTemplate from './DynamicTemplate';

        export const RemotionRoot = () => {
            return (
                <Composition
                    id="MainVideo"
                    component={DynamicTemplate}
                    durationInFrames={${totalFrames}}
                    fps={30}
                    width={1080}
                    height={1920}
                />
            );
        };
    `;
    fs.writeFileSync(rootPath, rootCode, 'utf8');

    const entryPath = path.resolve(__dirname, 'index.js');
    const entryCode = `
        import { registerRoot } from 'remotion';
        import { RemotionRoot } from './Root';
        
        const fontCSS = \`
            @import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.8/dist/web/static/pretendard.css");
            * { font-family: 'Pretendard', sans-serif !important; }
        \`;
        const styleSheet = document.createElement("style");
        styleSheet.type = "text/css";
        styleSheet.innerText = fontCSS;
        document.head.appendChild(styleSheet);

        registerRoot(RemotionRoot);
    `;
    fs.writeFileSync(entryPath, entryCode, 'utf8');

    console.log(`[INFO] 번들링 시작 (Total Frames: ${totalFrames})...`);

    try {
        const bundleLocation = await bundle({
            entryPoint: entryPath,
            webpackOverride: (config) => config,
        });

        const inputProps = { videoData };

        const composition = await selectComposition({
            serveUrl: bundleLocation,
            id: 'MainVideo',
            inputProps,
        });

        console.log(`[INFO] 비디오 렌더링 시작...`);
        const finalOutput = path.join(outputDir, 'final_shorts.mp4');
        
        await renderMedia({
            composition,
            serveUrl: bundleLocation,
            codec: 'h264',
            outputLocation: finalOutput,
            inputProps,
            chromiumOptions: {
                gl: 'angle',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            },
            onProgress: ({ renderedFrames }) => {
                if(renderedFrames % 30 === 0) console.log(`진행 상황: ${renderedFrames} / ${totalFrames} 프레임`);
            }
        });

        console.log(`📂 렌더링 완료! 결과물 위치: ${finalOutput}`);

    } catch (error) {
        console.error("❌ 비디오 렌더링 실패:", error);
        process.exit(1);
    }
}

runJsonToVideoRender();