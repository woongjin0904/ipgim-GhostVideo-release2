const fs = require('fs');
const path = require('path');
const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');

const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

async function runJsonToVideoRender() {
    console.log("🚀 GitHub Actions: JSON to Remotion 엔진 가동!");

    let videoData = {};

    try {
        // 💡 1. 깃허브 액션(render.yml)이 다운로드해둔 video.json 읽기
        const jsonPath = path.join(__dirname, 'video.json');
        if (!fs.existsSync(jsonPath)) {
            throw new Error("video.json 파일이 존재하지 않습니다. 다운로드에 실패했을 수 있습니다.");
        }
        const jsonString = fs.readFileSync(jsonPath, 'utf8');
        videoData = JSON.parse(jsonString);
        
        console.log(`[INFO] ✅ JSON 데이터 로드 완료! (타이틀: ${videoData.title})`);
    } catch (e) {
        console.error("❌ 데이터 로드 및 파싱 실패:", e);
        process.exit(1);
    }

    // 💡 2. render.yml이 생성해둔 템플릿 파일이 잘 있는지 확인
    const templatePath = path.resolve(__dirname, 'DynamicTemplate.jsx');
    if (!fs.existsSync(templatePath)) {
        console.error("❌ DynamicTemplate.jsx 파일이 존재하지 않습니다.");
        process.exit(1);
    }
    console.log("[INFO] ✅ 템플릿 코드 파일 확인 완료.");

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