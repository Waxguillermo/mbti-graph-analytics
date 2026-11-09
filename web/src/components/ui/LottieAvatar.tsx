import lottie, { type AnimationItem } from 'lottie-web';
import { useEffect, useRef, useState } from 'react';
import { MBTI_TYPES } from '../../engine/mbtiMetadata';
import type { MbtiCode } from '../../engine/types';

// Module-level cache so repeated renders of the same MBTI type never re-fetch JSON
const animationDataCache = new Map<MbtiCode, Promise<unknown>>();

function fetchAnimationJson(mbti: MbtiCode): Promise<unknown> {
  const cached = animationDataCache.get(mbti);
  if (cached) return cached;
  const promise = fetch(MBTI_TYPES[mbti].animationUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load animation for ${mbti}`);
      return res.json();
    })
    .catch((err) => {
      animationDataCache.delete(mbti);
      throw err;
    });
  animationDataCache.set(mbti, promise);
  return promise;
}

export interface LottieAvatarProps {
  mbti: MbtiCode;
  size?: number;
  /** 'always' loops continuously; 'hover' animates on pointer hover; 'static' renders crisp SVG */
  playMode?: 'always' | 'hover' | 'static';
  isHoveredExternal?: boolean;
  showMedallion?: boolean;
  className?: string;
}

export function LottieAvatar({
  mbti,
  size = 64,
  playMode = 'hover',
  isHoveredExternal,
  showMedallion = true,
  className = '',
}: LottieAvatarProps) {
  const meta = MBTI_TYPES[mbti];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [internalHover, setInternalHover] = useState(false);
  const [lottieReady, setLottieReady] = useState(false);

  const shouldAnimate =
    playMode === 'always' || (playMode === 'hover' && (isHoveredExternal ?? internalHover));

  useEffect(() => {
    if (playMode === 'static') return;
    let cancelled = false;

    fetchAnimationJson(mbti)
      .then((rawJson) => {
        if (cancelled || !containerRef.current) return;
        // Deep-clone JSON because lottie-web mutates layer objects in-place
        const clonedData = structuredClone(rawJson);
        const instance = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: playMode === 'always',
          animationData: clonedData,
        });
        animRef.current = instance;
        setLottieReady(true);
      })
      .catch(() => {
        if (!cancelled) setLottieReady(false);
      });

    return () => {
      cancelled = true;
      setLottieReady(false);
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, [mbti, playMode]);

  useEffect(() => {
    const anim = animRef.current;
    if (!anim || !lottieReady) return;
    if (shouldAnimate) {
      anim.play();
    } else {
      anim.goToAndStop(0, true);
    }
  }, [shouldAnimate, lottieReady]);

  return (
    <div
      onMouseEnter={playMode === 'hover' ? () => setInternalHover(true) : undefined}
      onMouseLeave={playMode === 'hover' ? () => setInternalHover(false) : undefined}
      style={{
        width: size,
        height: size,
        backgroundColor: showMedallion ? meta.softBg : 'transparent',
        borderColor: showMedallion ? `${meta.color}28` : 'transparent',
      }}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl ${
        showMedallion ? 'border shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]' : ''
      } ${className}`}
    >
      {/* Crisp vector fallback visible immediately before Lottie initializes or in static mode */}
      <img
        src={meta.avatarSvgUrl}
        alt={`${mbti} ${meta.title}`}
        loading="lazy"
        className={`h-[88%] w-[88%] object-contain transition-opacity duration-200 ${
          lottieReady && playMode !== 'static' ? 'opacity-0' : 'opacity-100'
        }`}
      />
      {playMode !== 'static' ? (
        <div
          ref={containerRef}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 flex items-center justify-center p-[5%] transition-opacity duration-200 ${
            lottieReady ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : null}
    </div>
  );
}
