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
// 💡 1. CSS 파일 생성 (가장 안정적인 v1.3.9 최신 버전 및 min.css 사용)
    const cssPath = path.resolve(__dirname, 'global.css');
    const cssCode = `
        @import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
        * { font-family: 'Pretendard', sans-serif !important; }
    `;
    fs.writeFileSync(cssPath, cssCode, 'utf8');

    // 💡 2. 동적 JS 주입 시 Remotion의 delayRender 적용 + 안전장치(Fallback 타이머)
    const entryPath = path.resolve(__dirname, 'index.js');
    const entryCode = `
        import { registerRoot, delayRender, continueRender } from 'remotion';
        import { RemotionRoot } from './Root';
        import './global.css'; 

        // 🚀 폰트 다운로드가 끝날 때까지 렌더링 엔진 강제 정지
        const waitForFont = delayRender("Waiting for Pretendard Font");
        let isFontRendered = false;

        // 중복 해제 방지를 위한 안전한 continueRender 래퍼 함수
        const safeContinueRender = () => {
            if (!isFontRendered) {
                isFontRendered = true;
                continueRender(waitForFont);
            }
        };

        const font = new FontFace(
            'Pretendard',
            'url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-Regular.woff2") format("woff2")'
        );

        font.load().then(() => {
            document.fonts.add(font);
            console.log("✅ Pretendard 폰트 로드 완료!");
            safeContinueRender();
        }).catch((err) => {
            console.error("❌ 폰트 로드 실패 (기본 폰트로 진행):", err);
            safeContinueRender();
        });

        // 🚨 최후의 보루: CDN 에러나 네트워크 지연으로 무한정 멈추는 것을 방지 (10초 후 강제 렌더링 시작)
        setTimeout(() => {
            if (!isFontRendered) {
                console.warn("⏳ 폰트 로딩 시간 초과! 렌더링 락 강제 해제");
                safeContinueRender();
            }
        }, 10000);

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