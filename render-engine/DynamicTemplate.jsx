// server/render-engine/DynamicTemplate.jsx
import React from 'react';
import { Series, AbsoluteFill, Img, useCurrentFrame, interpolate } from 'remotion';

// JSON 객체에 정의된 단일 씬을 렌더링하는 컴포넌트
const SceneComponent = ({ scene }) => {
    const frame = useCurrentFrame();
    
    // 간단한 페이드인 효과
    const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

    return (
        <AbsoluteFill style={{ backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' }}>
            {/* 배경 이미지 */}
            {scene.image && (
                <Img 
                    src={scene.image} 
                    style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} 
                />
            )}
            
            {/* 자막 텍스트 */}
            <div style={{
                opacity,
                fontSize: '60px',
                color: 'white',
                textAlign: 'center',
                padding: '40px',
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderRadius: '20px',
                zIndex: 10
            }}>
                {scene.text}
            </div>
        </AbsoluteFill>
    );
};

// 메인 컴포넌트: JSON 데이터를 받아 Series로 묶어줍니다.
export default function DynamicTemplate({ videoData }) {
    if (!videoData || !videoData.scenes) {
        return <AbsoluteFill style={{ backgroundColor: 'red' }}><h1>Data Error</h1></AbsoluteFill>;
    }

    return (
        <AbsoluteFill style={{ backgroundColor: 'black' }}>
            {/* 전체 비디오 제목 (고정 오버레이 예시) */}
            <div style={{ position: 'absolute', top: 50, left: 50, color: '#00f2fe', fontSize: '40px', zIndex: 100, fontWeight: 'bold' }}>
                {videoData.title}
            </div>

            {/* JSON의 scenes 배열을 순회하며 순차적으로 재생 */}
            <Series>
                {videoData.scenes.map((scene, index) => (
                    <Series.Sequence key={index} durationInFrames={scene.durationInFrames || 90}>
                        <SceneComponent scene={scene} />
                    </Series.Sequence>
                ))}
            </Series>
        </AbsoluteFill>
    );
}