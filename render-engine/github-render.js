
const fs = require('fs');
const path = require('path');
const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');

const outputDir = path.join(__dirname, '../../output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

async function runJsonToVideoRender() {
    console.log("🚀 GitHub Actions: JSON to Remotion 엔진 가동!");

    // 1. GitHub Actions에서 전달받은 Base64 JSON 디코딩
    const base64Json = process.env.VIDEO_JSON_BASE64 || "";
    let videoData = {};
    try {
        const decodedString = Buffer.from(base64Json, 'base64').toString('utf8');
        videoData = JSON.parse(decodedString);
        console.log(`[INFO] 파싱된 JSON 타이틀: ${videoData.title}`);
    } catch (e) {
        console.error("❌ JSON 파싱 실패:", e);
        process.exit(1);
    }

    // 2. 총 렌더링 프레임 계산 (각 씬의 duration 합산)
    let totalFrames = 0;
    if (videoData.scenes && videoData.scenes.length > 0) {
        videoData.scenes.forEach(scene => {
            totalFrames += scene.durationInFrames || 90; // 기본값 90프레임
        });
    } else {
        totalFrames = 150; // 씬이 없을 경우 최소 5초(30fps)
    }

    // 3. Remotion Root 설정 파일 동적 생성
    // JSON 구조를 동적으로 렌더링할 수 있는 DynamicTemplate 컴포넌트를 사용합니다.
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

    // 4. 번들링 진입점 생성 (폰트 포함)
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

        // JSON 데이터를 Remotion 컴포넌트의 props로 주입합니다.
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